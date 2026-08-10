#include "cloud.h"
#include "appstate.h"
#include "timekeeper.h"
#include "motion.h"
#include "storage.h"
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

extern void otaCheckAndApply(bool force);

static uint32_t s_lastHeartbeat = 0;

static void applyTls(WiFiClientSecure& c) { c.setInsecure(); c.setTimeout(15000); }

// cloudUrl 은 ".../api/ingest" 형태 → 베이스(오리진) 추출
static String baseOrigin() {
  String u = g_cfg.cloudUrl;
  int p = u.indexOf("/api/");
  return p > 0 ? u.substring(0, p) : u;
}

// ─── 공통 POST(JSON) ───────────────────────────────────────────────────────
static int cloudPostJson(const String& url, const String& body, String& resp) {
  if (!g_rt.wifiConnected) return -1;
  WiFiClientSecure client; applyTls(client);
  HTTPClient http;
  if (!http.begin(client, url)) return -1;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", g_cfg.deviceKey);
  int code = http.POST((uint8_t*)body.c_str(), body.length());
  if (code > 0) resp = http.getString();
  http.end();
  return code;
}

void cloudBegin() {
  Serial.printf("[cloud] 인제스트 URL: %s\n", g_cfg.cloudUrl);
}

// ─── 이벤트 인제스트 (메타 + 소형 썸네일 base64) ───────────────────────────
String cloudIngestEvent(const String& detectedIso, uint32_t epoch, bool timeSynced,
                        const char* trigger, uint8_t score, uint16_t hitCount,
                        const String& localPath, const uint8_t* thumb, size_t thumbLen) {
  if (strlen(g_cfg.cloudUrl) == 0) return "";
  DynamicJsonDocument d(4096);
  d["device_key"]     = g_cfg.deviceKey;
  d["device_name"]    = g_cfg.deviceName;
  d["fw_version"]     = FW_VERSION;
  d["detected_at"]    = detectedIso;
  d["detected_epoch"] = epoch;
  d["time_synced"]    = timeSynced;
  d["trigger"]        = trigger;
  d["score"]          = score;
  d["hit_count"]      = hitCount;
  d["local_path"]     = localPath;
  d["rssi"]           = g_rt.rssi;
  d["sd_used_pct"]    = g_rt.sdUsedPct;
  // 소형 썸네일(≤ 수십 KB)만 base64 로 함수 경유 (원본은 서명URL 직접 업로드)
  if (thumb && thumbLen && thumbLen < 60000) {
    String b64; b64.reserve((thumbLen * 4) / 3 + 8);
    static const char* T = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    size_t i = 0;
    for (; i + 2 < thumbLen; i += 3) {
      uint32_t n = (thumb[i] << 16) | (thumb[i+1] << 8) | thumb[i+2];
      b64 += T[(n>>18)&63]; b64 += T[(n>>12)&63]; b64 += T[(n>>6)&63]; b64 += T[n&63];
    }
    if (i < thumbLen) {
      uint32_t n = thumb[i] << 16; if (i+1 < thumbLen) n |= thumb[i+1] << 8;
      b64 += T[(n>>18)&63]; b64 += T[(n>>12)&63];
      b64 += (i+1 < thumbLen) ? T[(n>>6)&63] : '='; b64 += '=';
    }
    d["thumb_b64"] = b64;
  }
  String body; serializeJson(d, body);
  String resp;
  int code = cloudPostJson(g_cfg.cloudUrl, body, resp);
  if (code == 200 || code == 201) {
    DynamicJsonDocument r(512);
    if (!deserializeJson(r, resp)) {
      String id = r["id"] | "";
      Serial.printf("[cloud] 인제스트 OK id=%s\n", id.c_str());
      return id;
    }
  }
  Serial.printf("[cloud] 인제스트 실패 code=%d\n", code);
  return "";
}

// ─── 서명 URL 발급 → 직접 PUT → 완료 통보 ──────────────────────────────────
bool cloudUploadMedia(const String& eventId, const char* kind,
                      const uint8_t* data, size_t len, const char* contentType) {
  if (eventId.length() == 0 || !data || !len) return false;

  // 1) 서명 업로드 URL 발급
  DynamicJsonDocument req(512);
  req["event_id"] = eventId; req["kind"] = kind; req["content_type"] = contentType; req["size"] = len;
  String rbody; serializeJson(req, rbody);
  String signResp;
  int code = cloudPostJson(baseOrigin() + "/api/ingest/media/sign", rbody, signResp);
  if (code != 200) { Serial.printf("[cloud] 서명URL 실패 code=%d\n", code); return false; }
  DynamicJsonDocument sd(1024);
  if (deserializeJson(sd, signResp)) return false;
  String putUrl = sd["url"] | "";
  String finalUrl = sd["public_url"] | (sd["path"] | "");
  if (putUrl.length() == 0) return false;

  // 2) Supabase Storage 로 직접 PUT (Vercel 우회)
  WiFiClientSecure client; applyTls(client);
  HTTPClient http;
  if (!http.begin(client, putUrl)) return false;
  http.addHeader("Content-Type", contentType);
  int putCode = http.sendRequest("PUT", (uint8_t*)data, len);
  http.end();
  if (putCode < 200 || putCode >= 300) { Serial.printf("[cloud] PUT 실패 code=%d\n", putCode); return false; }

  // 3) 완료 통보 → events URL 갱신
  DynamicJsonDocument comp(512);
  comp["event_id"] = eventId; comp["kind"] = kind; comp["url"] = finalUrl;
  String cbody; serializeJson(comp, cbody);
  String cresp;
  cloudPostJson(baseOrigin() + "/api/ingest/media/complete", cbody, cresp);
  Serial.printf("[cloud] 미디어 업로드 완료 kind=%s (%u bytes)\n", kind, (unsigned)len);
  return true;
}

// ─── 하트비트 + 원격 명령 ──────────────────────────────────────────────────
void cloudHeartbeat() {
  if (millis() - s_lastHeartbeat < HEARTBEAT_INTERVAL_MS) return;
  s_lastHeartbeat = millis();
  if (!g_rt.wifiConnected) return;
  storageUpdateStats();

  DynamicJsonDocument d(512);
  d["device_key"]  = g_cfg.deviceKey;
  d["device_name"] = g_cfg.deviceName;
  d["fw_version"]  = FW_VERSION;
  d["rssi"]        = g_rt.rssi;
  d["sd_used_pct"] = g_rt.sdUsedPct;
  d["time_synced"] = g_rt.timeSynced;
  d["uptime_s"]    = millis() / 1000;
  String body; serializeJson(d, body);

  String resp;
  int code = cloudPostJson(baseOrigin() + "/api/heartbeat", body, resp);
  if (code != 200) return;

  // 응답의 대기 명령 처리 (촬영/OTA 등)
  DynamicJsonDocument r(1024);
  if (deserializeJson(r, resp)) return;
  JsonArray cmds = r["commands"].as<JsonArray>();
  for (JsonVariant c : cmds) {
    String cmd = c.as<String>();
    if (cmd == "capture") { motionForce(TRIG_MANUAL); Serial.println(F("[cloud] 원격 촬영 명령")); }
    else if (cmd == "ota") { otaCheckAndApply(true); }
  }
}
