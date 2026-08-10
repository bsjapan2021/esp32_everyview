#include "otaupd.h"
#include "appstate.h"
#include <WiFi.h>
#include <ArduinoOTA.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Update.h>
#include <mbedtls/sha256.h>
#include "esp_ota_ops.h"
#include "esp_task_wdt.h"

extern bool notifySendText(const String& msg);

static uint32_t s_lastCheck = 0;

// ─── SemVer 비교: a>b → 1, a==b → 0, a<b → -1 ──────────────────────────────
static int semverCmp(const String& a, const String& b) {
  int ai = 0, bi = 0;
  for (int i = 0; i < 3; i++) {
    int an = 0, bn = 0;
    while (ai < (int)a.length() && a[ai] != '.') an = an * 10 + (a[ai++] - '0');
    while (bi < (int)b.length() && b[bi] != '.') bn = bn * 10 + (b[bi++] - '0');
    ai++; bi++;
    if (an != bn) return an > bn ? 1 : -1;
  }
  return 0;
}

void otaReportFlashInfo() {
  g_rt.flashKB = ESP.getFlashChipSize() / 1024;
  const esp_partition_t* run = esp_ota_get_running_partition();
  snprintf(g_rt.partScheme, sizeof(g_rt.partScheme), "%s", run ? run->label : "?");
  Serial.printf("[ota] 플래시 %uKB · 실행 파티션 '%s' (subtype 0x%02x)\n",
                g_rt.flashKB, g_rt.partScheme, run ? run->subtype : 0);
  if (g_rt.flashKB < 8192)
    Serial.println(F("[ota] 4MB 플래시 → partitions_ota.csv(app0/app1 1.9MB) 사용 확인"));
}

void otaBegin() {
  otaReportFlashInfo();

  // 로컬 OTA (FR-6.1): 호스트명 gbsa0001-<MAC4>, 비번은 device_key 파생
  uint8_t mac[6]; WiFi.macAddress(mac);
  char host[24]; snprintf(host, sizeof(host), "everyview-%02x%02x", mac[4], mac[5]);
  ArduinoOTA.setHostname(host);
  if (strlen(g_cfg.deviceKey) >= 8) {
    String pw = String(g_cfg.deviceKey).substring(0, 12);
    ArduinoOTA.setPassword(pw.c_str());
  }
  ArduinoOTA.onStart([]() { Serial.println(F("[ota] 로컬 OTA 시작")); });
  ArduinoOTA.onEnd([]()   { Serial.println(F("[ota] 로컬 OTA 완료")); });
  ArduinoOTA.onError([](ota_error_t e) { Serial.printf("[ota] 오류 %u\n", e); });
  ArduinoOTA.begin();
  Serial.printf("[ota] ArduinoOTA 준비: %s.local\n", host);
}

void otaMarkValidAfterSelfTest() {
  // 자가점검(카메라/WiFi/NTP)은 호출 측에서 확인 후 진입. 여기서 유효 확정.
  const esp_partition_t* run = esp_ota_get_running_partition();
  esp_ota_img_states_t st;
  if (esp_ota_get_state_partition(run, &st) == ESP_OK && st == ESP_OTA_IMG_PENDING_VERIFY) {
    esp_ota_mark_app_valid_cancel_rollback();
    Serial.println(F("[ota] 자가점검 통과 → 이미지 유효 확정(롤백 취소)"));
  }
}

// ─── HTTPS OTA 본체 ────────────────────────────────────────────────────────
static bool downloadAndFlash(const String& url, const String& expectSha, size_t expectSize) {
  WiFiClientSecure client; client.setInsecure(); client.setTimeout(20000);
  HTTPClient http;
  if (!http.begin(client, url)) { notifySendText("❌ OTA: URL 열기 실패"); return false; }
  http.addHeader("Accept", "application/octet-stream");
  // GitHub Release 자산은 302로 CDN(objects.githubusercontent.com 등)으로 리다이렉트되므로 추적 필수
  http.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);
  int code = http.GET();
  if (code != 200) { http.end(); notifySendText("❌ OTA: HTTP " + String(code)); return false; }

  int len = http.getSize();
  size_t total = (len > 0) ? (size_t)len : expectSize;
  if (total == 0) { http.end(); return false; }
  if (!Update.begin(total)) { http.end(); notifySendText("❌ OTA: 파티션 공간 부족"); return false; }

  mbedtls_sha256_context sha; mbedtls_sha256_init(&sha); mbedtls_sha256_starts(&sha, 0);
  WiFiClient* stream = http.getStreamPtr();
  uint8_t buf[1024];
  size_t written = 0; int lastPct = -1;
  uint32_t lastMsg = 0;
  while (http.connected() && written < total) {
    esp_task_wdt_reset();   // 대용량 다운로드 중 워치독 리셋 방지 (FR-8.1)
    size_t avail = stream->available();
    if (avail) {
      int n = stream->readBytes(buf, min(avail, sizeof(buf)));
      if (n <= 0) break;
      if (Update.write(buf, n) != (size_t)n) { Update.abort(); http.end(); return false; }
      mbedtls_sha256_update(&sha, buf, n);
      written += n;
      int pct = (int)(written * 100 / total);
      if (pct / 10 != lastPct / 10 && millis() - lastMsg > 1500) {   // 10% 단위 (FR-6.5)
        lastPct = pct; lastMsg = millis();
        Serial.printf("[ota] 진행 %d%%\n", pct);
        notifySendText("⬆️ OTA " + String(pct) + "%");
      }
    } else delay(5);
  }
  http.end();

  uint8_t digest[32]; mbedtls_sha256_finish(&sha, digest); mbedtls_sha256_free(&sha);
  char hex[65]; for (int i = 0; i < 32; i++) snprintf(hex + i*2, 3, "%02x", digest[i]);

  if (written != total) { Update.abort(); notifySendText("❌ OTA: 크기 불일치"); return false; }
  if (expectSha.length() == 64 && !expectSha.equalsIgnoreCase(hex)) {   // FR-6.3
    Update.abort();
    Serial.printf("[ota] SHA 불일치\n  기대 %s\n  실제 %s\n", expectSha.c_str(), hex);
    notifySendText("❌ OTA: SHA-256 검증 실패 → 중단·롤백");
    return false;
  }
  if (!Update.end(true)) { notifySendText("❌ OTA: 마무리 실패"); return false; }

  Serial.println(F("[ota] 검증 완료 → 재부팅"));
  notifySendText("✅ OTA 완료 → 재부팅");
  delay(800);
  ESP.restart();
  return true;
}

void otaCheckAndApply(bool force) {
  if (!g_rt.wifiConnected) return;
  Serial.println(F("[ota] manifest 확인..."));
  WiFiClientSecure client; client.setInsecure(); client.setTimeout(15000);
  HTTPClient http;
  if (!http.begin(client, OTA_MANIFEST_URL)) return;
  http.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);  // releases/latest/download/... 도 302 리다이렉트
  int code = http.GET();
  if (code != 200) { http.end(); Serial.printf("[ota] manifest HTTP %d\n", code); return; }
  String body = http.getString(); http.end();

  DynamicJsonDocument d(1024);
  if (deserializeJson(d, body)) { Serial.println(F("[ota] manifest 파싱 실패")); return; }
  String ver = d["version"] | "";
  String url = d["url"] | "";
  String sha = d["sha256"] | "";
  size_t size = d["size"] | 0;
  if (ver.length() == 0 || url.length() == 0) return;

  int cmp = semverCmp(ver, FW_VERSION);
  Serial.printf("[ota] 현재 %s / 최신 %s\n", FW_VERSION, ver.c_str());
  if (cmp <= 0 && !force) { notifySendText("ℹ️ 이미 최신 버전(" FW_VERSION ")"); return; }
  if (cmp <= 0 && force)  { Serial.println(F("[ota] 강제 재설치")); }

  // OTA는 수십 초 블로킹(TLS 핸드셰이크·리다이렉트·다운로드) → 이 구간만 loopTask를
  // 워치독 감시에서 해제(다운로드 루프의 개별 reset로는 http.GET 블로킹을 못 먹임).
  esp_task_wdt_delete(NULL);
  notifySendText("⬆️ OTA 시작: v" + ver);
  downloadAndFlash(url, sha, size);   // 성공 시 재부팅(반환 안 함)
  esp_task_wdt_add(NULL);             // 다운로드 실패로 복귀 시 워치독 재등록
}

void otaLoop() {
  ArduinoOTA.handle();
  // 자동 확인(기본 24h), 자동 적용은 OFF (FR-6.4)
  if (OTA_AUTO_APPLY && millis() - s_lastCheck > OTA_CHECK_INTERVAL_MS) {
    s_lastCheck = millis();
    otaCheckAndApply(false);
  }
}
