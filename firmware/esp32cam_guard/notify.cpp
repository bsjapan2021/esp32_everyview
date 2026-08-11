#include "notify.h"
#include "appstate.h"
#include "timekeeper.h"
#include "motion.h"
#include "storage.h"
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// otaupd / portal 액션 (약결합)
extern void otaCheckAndApply(bool force);
extern void portalForce();

static const char* TG_HOST = "api.telegram.org";
static long  s_updateOffset = 0;
static uint32_t s_lastPoll = 0;

// ─── TLS 정책 — FR-5.9 ─────────────────────────────────────────────────────
//  기본은 CA 검증이 목표이나, 현장 CA 만료 리스크(R15)와 무테스트 배포를 고려해
//  기본 동작은 setInsecure(). certs.h 에 검증된 루트 CA를 넣고 USE_TG_CA 정의 시 핀닝.
//  포털에서 tlsInsecure 토글 시에도 setInsecure().
static void applyTls(WiFiClientSecure& c) {
#if defined(USE_TG_CA) && defined(TELEGRAM_ROOT_CA)
  if (g_cfg.tlsInsecure) c.setInsecure();
  else c.setCACert(TELEGRAM_ROOT_CA);
#else
  c.setInsecure();     // CA 미내장 → 검증 생략(로그로 명시). 포털 tlsInsecure 와 동일 효과.
#endif
  c.setTimeout(15000);
}

void notifyBegin() {
  if (strlen(g_cfg.tgToken) == 0)
    Serial.println(F("[tg] 토큰 미설정 — 포털에서 입력 필요"));
#if !defined(USE_TG_CA)
  Serial.println(F("[tg] ⚠ TLS 검증 생략(setInsecure). 운영 강화 시 certs.h 루트 CA 핀닝 권장(FR-5.9)"));
#endif
}

bool notifyMuted() {
  return g_rt.muteUntilEpoch > 0 && tkEpoch() < g_rt.muteUntilEpoch;
}

// ─── 저수준 GET (getMe/getUpdates/sendMessage) ─────────────────────────────
static bool tgApiGet(const String& method, const String& query, String& resp) {
  if (strlen(g_cfg.tgToken) == 0) return false;
  WiFiClientSecure client; applyTls(client);
  HTTPClient http;
  String url = String("https://") + TG_HOST + "/bot" + g_cfg.tgToken + "/" + method + query;
  if (!http.begin(client, url)) return false;
  int code = http.GET();
  bool ok = code == 200;
  if (ok) resp = http.getString();
  http.end();
  return ok;
}

bool notifyValidateToken() {
  String r;
  bool ok = tgApiGet("getMe", "", r) && r.indexOf("\"ok\":true") >= 0;
  Serial.printf("[tg] getMe: %s\n", ok ? "OK" : "실패");
  return ok;
}

static String urlEncode(const String& s) {
  String out; char buf[4];
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if (isalnum(c)) out += c;
    else { snprintf(buf, sizeof(buf), "%%%02X", (uint8_t)c); out += buf; }
  }
  return out;
}

static bool tgSendMessage(const String& chatId, const String& text) {
  if (chatId.length() == 0) return false;
  String q = "?chat_id=" + chatId + "&parse_mode=HTML&text=" + urlEncode(text);
  String r;
  return tgApiGet("sendMessage", q, r) && r.indexOf("\"ok\":true") >= 0;
}

bool notifySendText(const String& msg) {
  if (strlen(g_cfg.tgChatId) == 0) return false;
  return tgSendMessage(g_cfg.tgChatId, msg);
}

void notifySystem(const String& msg) {
  if (notifyMuted()) return;
  notifySendText(msg);
}

// ─── sendPhoto (multipart/form-data 직접 전송) ─────────────────────────────
static const char* BOUNDARY = "----esp32camguardboundary";

bool notifySendPhoto(const uint8_t* jpg, size_t len, const String& caption, bool withButtons) {
  if (strlen(g_cfg.tgToken) == 0 || strlen(g_cfg.tgChatId) == 0 || !jpg || !len) return false;

  WiFiClientSecure client; applyTls(client);
  if (!client.connect(TG_HOST, 443)) { Serial.println(F("[tg] 연결 실패")); return false; }

  // 파트: chat_id, caption, (reply_markup), photo
  String head;
  auto field = [&](const String& name, const String& value) {
    head += "--"; head += BOUNDARY; head += "\r\n";
    head += "Content-Disposition: form-data; name=\""; head += name; head += "\"\r\n\r\n";
    head += value; head += "\r\n";
  };
  field("chat_id", String(g_cfg.tgChatId));
  if (caption.length()) field("caption", caption);
  if (withButtons) {
    String kb = "{\"inline_keyboard\":[["
      "{\"text\":\"\xF0\x9F\x93\xB8 지금촬영\",\"callback_data\":\"photo\"},"
      "{\"text\":\"\xF0\x9F\x94\x87 30분 음소거\",\"callback_data\":\"mute30\"}],"
      "[{\"text\":\"\xF0\x9F\x94\xB4 녹화\",\"callback_data\":\"clip\"},"
      "{\"text\":\"\xE2\x9A\x99 상태\",\"callback_data\":\"status\"}]]}";
    field("reply_markup", kb);
  }
  head += "--"; head += BOUNDARY; head += "\r\n";
  head += "Content-Disposition: form-data; name=\"photo\"; filename=\"evt.jpg\"\r\n";
  head += "Content-Type: image/jpeg\r\n\r\n";
  String tail = String("\r\n--") + BOUNDARY + "--\r\n";

  size_t contentLen = head.length() + len + tail.length();
  String req = String("POST /bot") + g_cfg.tgToken + "/sendPhoto HTTP/1.1\r\n";
  req += "Host: "; req += TG_HOST; req += "\r\n";
  req += "Content-Type: multipart/form-data; boundary="; req += BOUNDARY; req += "\r\n";
  req += "Content-Length: "; req += String(contentLen); req += "\r\n";
  req += "Connection: close\r\n\r\n";

  client.print(req);
  client.print(head);
  // 바이너리 청크 전송
  const size_t CHUNK = 1024;
  for (size_t i = 0; i < len; i += CHUNK) {
    size_t n = min(CHUNK, len - i);
    if (client.write(jpg + i, n) != n) { client.stop(); return false; }
  }
  client.print(tail);

  // 응답 확인
  uint32_t start = millis();
  String status;
  while (client.connected() && millis() - start < 15000) {
    if (client.available()) { status = client.readStringUntil('\n'); break; }
    delay(5);
  }
  bool ok = status.indexOf("200") >= 0;
  // 본문에서 ok:true 도 확인
  String body;
  while (client.available() && millis() - start < 15000) body += (char)client.read();
  if (body.indexOf("\"ok\":true") >= 0) ok = true;
  client.stop();
  Serial.printf("[tg] sendPhoto: %s (%u bytes)\n", ok ? "OK" : "실패", (unsigned)len);
  return ok;
}

// ─── 이벤트 알림 (재시도 + 큐) — FR-5.1/5.7 ────────────────────────────────
void notifyEvent(const String& caption, const uint8_t* jpg, size_t len) {
  if (notifyMuted()) { Serial.println(F("[tg] 음소거 중 — 이벤트 알림 생략")); return; }

  // 지수 백오프 3회(2·4·8초)
  uint16_t delays[] = {0, 2000, 4000, 8000};
  for (int i = 0; i < 4; i++) {
    if (delays[i]) delay(delays[i]);
    if (notifySendPhoto(jpg, len, caption, true)) return;
    if (!g_rt.wifiConnected) break;
  }
  // 최종 실패 → SD 큐 적재(사진은 SD 원본 참조, 캡션만 큐잉) — FR-5.7
  StaticJsonDocument<512> d;
  d["caption"] = caption;
  d["ts"] = tkEpoch();
  String line; serializeJson(d, line);
  storageQueuePush(line);
  Serial.println(F("[tg] 전송 최종 실패 → 재전송 큐 적재"));
}

void notifyFlushQueue() {
  if (!g_rt.wifiConnected || strlen(g_cfg.tgChatId) == 0) return;
  auto pending = storageQueuePopAll();
  for (auto& line : pending) {
    StaticJsonDocument<512> d;
    if (deserializeJson(d, line)) continue;
    String cap = d["caption"] | "";
    notifySendText(String("(재전송) ") + cap);
    delay(300);
  }
  if (pending.size()) Serial.printf("[tg] 큐 %u건 재전송\n", (unsigned)pending.size());
}

// ─── 명령 폴링 (getUpdates) + 자동 페어링 — FR-5.0.3/5.5/5.6 ────────────────
static void handleCommand(const String& chatId, const String& fromUser, const String& text) {
  // 인가 검증: 등록된 chat_id 만 허용 (FR-5.6)
  if (strlen(g_cfg.tgChatId) > 0 && chatId != g_cfg.tgChatId) {
    if (++g_rt.unauthCount >= 3) notifySendText("⚠ 미인가 접근 3회 감지");
    Serial.printf("[tg] 미인가 chat_id=%s user=%s 무시\n", chatId.c_str(), fromUser.c_str());
    return;
  }

  String cmd = text; cmd.trim();
  if (cmd.startsWith("/status")) {
    storageUpdateStats();
    String m = "⚙️ <b>" + String(g_cfg.deviceName) + "</b>\n";
    m += "버전 " + String(FW_VERSION) + " · 업타임 " + String(millis()/60000) + "분\n";
    m += "WiFi " + String(g_rt.rssi) + "dBm · SD " + String(g_rt.sdUsedPct) + "%\n";
    m += "시각동기 " + String(g_rt.timeSynced ? "OK" : "미동기") + " · 이벤트 " + String(g_rt.eventCount);
    notifySendText(m);
  } else if (cmd.startsWith("/photo")) {
    motionForce(TRIG_MANUAL);
    notifySendText("📸 촬영 요청 접수");
  } else if (cmd.startsWith("/clip")) {
    motionForce(TRIG_MANUAL);
    notifySendText("🔴 녹화 요청 접수");
  } else if (cmd.startsWith("/mute")) {
    int mins = 30; int sp = cmd.indexOf(' ');
    if (sp > 0) mins = cmd.substring(sp + 1).toInt();
    if (mins <= 0) mins = 30;
    g_rt.muteUntilEpoch = tkEpoch() + mins * 60;
    notifySendText("🔇 " + String(mins) + "분 음소거");
  } else if (cmd.startsWith("/unmute")) {
    g_rt.muteUntilEpoch = 0; notifySendText("🔔 음소거 해제");
  } else if (cmd.startsWith("/storage")) {
    storageUpdateStats();
    notifySendText("💾 SD " + String(g_rt.sdUsedPct) + "% 사용 / 총 " +
                   String((unsigned long)(g_rt.sdTotalBytes/1024/1024)) + "MB");
  } else if (cmd.startsWith("/reboot")) {
    notifySendText("♻️ 재부팅"); delay(500); ESP.restart();
  } else if (cmd.startsWith("/version")) {
    notifySendText("🔖 " + String(FW_NAME) + " v" + FW_VERSION + " (" + FW_BUILD + ")");
  } else if (cmd.startsWith("/ota")) {
    notifySendText("⬆️ OTA 확인 시작"); otaCheckAndApply(true);
  } else if (cmd.startsWith("/start")) {
    // 자동 페어링: chat_id 미등록이면 등록 (FR-5.0.3)
    if (strlen(g_cfg.tgChatId) == 0) {
      strlcpy(g_cfg.tgChatId, chatId.c_str(), sizeof(g_cfg.tgChatId));
      extern void portalSaveConfig(); portalSaveConfig();
      notifySendText("✅ 페어링 완료 — 이 대화로 알림을 보냅니다.\n장치: " + String(g_cfg.deviceName));
      Serial.printf("[tg] 자동 페어링 chat_id=%s\n", chatId.c_str());
    } else {
      notifySendText("👋 이미 연결됨: " + String(g_cfg.deviceName));
    }
  }
}

static void handleCallback(const String& chatId, const String& data) {
  if (strlen(g_cfg.tgChatId) > 0 && chatId != g_cfg.tgChatId) return;
  if (data == "photo")  { motionForce(TRIG_MANUAL); notifySendText("📸 촬영 요청"); }
  else if (data == "mute30") { g_rt.muteUntilEpoch = tkEpoch() + 1800; notifySendText("🔇 30분 음소거"); }
  else if (data == "clip")   { motionForce(TRIG_MANUAL); notifySendText("🔴 녹화 요청"); }
  else if (data == "status") { handleCommand(chatId, "", "/status"); }
}

void notifyPoll() {
  if (strlen(g_cfg.tgToken) == 0 || !g_rt.wifiConnected) return;
  if (millis() - s_lastPoll < 3000) return;              // 3초 주기
  s_lastPoll = millis();

  String q = "?timeout=1&limit=3&offset=" + String(s_updateOffset);
  String resp;
  if (!tgApiGet("getUpdates", q, resp)) return;

  // callback_query(버튼)는 원본 사진 메시지 전체(사진 변형·캡션·키보드)를 포함해 크다.
  // 필요한 필드만 필터 파싱 → 버퍼 초과로 파싱 실패해 버튼이 무시되던 문제 해결.
  StaticJsonDocument<384> filter;
  filter["result"][0]["update_id"] = true;
  filter["result"][0]["message"]["chat"]["id"] = true;
  filter["result"][0]["message"]["from"]["username"] = true;
  filter["result"][0]["message"]["text"] = true;
  filter["result"][0]["callback_query"]["message"]["chat"]["id"] = true;
  filter["result"][0]["callback_query"]["data"] = true;

  DynamicJsonDocument doc(4096);
  if (deserializeJson(doc, resp, DeserializationOption::Filter(filter))) return;
  JsonArray result = doc["result"].as<JsonArray>();
  for (JsonObject upd : result) {
    long updateId = upd["update_id"] | 0;
    s_updateOffset = updateId + 1;

    if (upd.containsKey("message")) {
      JsonObject msg = upd["message"];
      String chatId  = String((long long)(msg["chat"]["id"] | 0LL));  // chat_id는 32비트 초과 → 64비트
      String fromU   = msg["from"]["username"] | "";
      String text    = msg["text"] | "";
      if (text.length()) handleCommand(chatId, fromU, text);
    } else if (upd.containsKey("callback_query")) {
      JsonObject cq = upd["callback_query"];
      String chatId = String((long long)(cq["message"]["chat"]["id"] | 0LL));  // 64비트 chat_id
      String data   = cq["data"] | "";
      handleCallback(chatId, data);
    }
  }
}
