// ============================================================================
//  ESP32CAM-Guard — WiFi 포털 기반 이벤트 감지·녹화·원격알림 감시장치
//  대상: AI-Thinker ESP32-CAM (PSRAM 필수) · 4MB 양면 OTA 파티션
//
//  아키텍처 노트(FR-8.5 관련 설계 결정):
//   esp32-camera 드라이버의 프레임버퍼는 두 태스크에서 동시 접근 시 경합 위험이
//   있어, 본 펌웨어는 카메라 접근을 단일 협조적 슈퍼루프로 직렬화한다. 감지 응답성은
//   쿨다운(기본20s)과 유계 네트워크 동작으로 확보한다. (듀얼 태스크+뮤텍스 대안은
//   하드웨어 검증 후 도입 — docs/troubleshooting.md 참조)
// ============================================================================
#include <Arduino.h>
#include <vector>
#include <SD_MMC.h>
#include <ArduinoJson.h>
#include "esp_task_wdt.h"
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

#include "config.h"
#include "appstate.h"
#include "portal.h"
#include "timekeeper.h"
#include "camera.h"
#include "motion.h"
#include "storage.h"
#include "notify.h"
#include "cloud.h"
#include "otaupd.h"
#include "localweb.h"

// ─── 전역 인스턴스 ─────────────────────────────────────────────────────────
Config  g_cfg;
Runtime g_rt;

// NTP 미동기 이벤트 소급보정용 (FR-4.7)
struct UnsyncedEvt { String jsonPath; uint32_t uptimeMs; };
static std::vector<UnsyncedEvt> s_unsynced;
static bool s_wasSynced = false;

static uint32_t s_lastDetect = 0, s_lastPurge = 0, s_lastFlush = 0, s_lastHeartbeatMsg = 0;

// ─── 이벤트 캡션 구성 (FR-5.3) ─────────────────────────────────────────────
static String buildCaption(const String& iso, const char* trig, uint8_t score,
                           const String& base, uint16_t hit) {
  String human = tkStampHuman();
  String cap = "🚨 움직임 감지\n";
  cap += "🕒 " + human + " (KST)";
  if (!g_rt.timeSynced) cap += " ⚠TIME_UNSYNCED";
  cap += "\n📍 " + String(g_cfg.deviceName);
  if (strlen(g_cfg.location)) cap += " / " + String(g_cfg.location);
  cap += "\n🎯 트리거: " + String(trig) + " (점수 " + String(score) + "%)";
  if (hit > 1) cap += " x" + String(hit);
  int slash = base.lastIndexOf('/');
  cap += "\n💾 " + (slash >= 0 ? base.substring(slash + 1) : base);
  cap += "\n🔋 WiFi " + String(g_rt.rssi) + "dBm · SD " + String(g_rt.sdUsedPct) + "% 사용";
  return cap;
}

// ─── AVI 클립 녹화(전방 clipSec초, HD) — FR-2.3 ────────────────────────────
//  프리롤(2s)은 RAM 링버퍼 확보가 메모리 부담이라 1차 구현에서 전방 녹화로 대체.
//  (프리롤은 docs 로드맵 — 감지시각·스냅샷은 프리롤과 무관하게 보장)
static void recordClip(const String& aviPath) {
  if (!g_cfg.clipEnabled || !g_rt.sdMounted) return;
  AviWriter avi;
  camera_fb_t* first = camCapture();
  uint16_t w = first ? first->width : 1280, h = first ? first->height : 720;
  if (first) camReturn(first);
  if (!avi.begin(aviPath, w, h, 10)) return;
  uint32_t end = millis() + (uint32_t)g_cfg.clipSec * 1000;
  while (millis() < end) {
    camera_fb_t* fb = camCapture();
    if (fb) { avi.addFrame(fb->buf, fb->len); camReturn(fb); }
    esp_task_wdt_reset();
    delay(90);   // ~10fps
  }
  avi.end();
  Serial.printf("[evt] 클립 저장 %s (%u프레임)\n", aviPath.c_str(), avi.frameCount());
}

// ─── 파일 → PSRAM 버퍼 (클립 클라우드 업로드용, 상한) ──────────────────────
static uint8_t* readFile(const String& path, size_t* len, size_t maxLen) {
  if (!SD_MMC.exists(path)) return nullptr;
  File f = SD_MMC.open(path, FILE_READ);
  if (!f) return nullptr;
  size_t sz = f.size();
  if (sz == 0 || sz > maxLen) { f.close(); return nullptr; }
  uint8_t* buf = (uint8_t*)ps_malloc(sz);
  if (!buf) buf = (uint8_t*)malloc(sz);
  if (!buf) { f.close(); return nullptr; }
  f.read(buf, sz); f.close();
  *len = sz;
  return buf;
}

// ─── 이벤트 처리 파이프라인 ────────────────────────────────────────────────
static void handleEvent(const MotionResult& r) {
  // 이벤트 처리(캡처+SD+텔레그램 재시도 백오프+클라우드 업로드)는 장시간 블로킹이라
  // loopTask를 이 구간만 워치독 감시에서 해제(재부팅 루프 방지). 끝에서 복원.
  esp_task_wdt_delete(NULL);
  time_t t = tkNow();
  String iso   = tkStampISO(t);
  String base  = storageEventBase(t);           // /DCIM/date/EVT_...
  const char* trig = triggerName(r.trigger);
  uint16_t hit = motionHitCount();
  g_rt.eventCount++;

  Serial.printf("[evt] ▶ %s score=%d trig=%s → %s\n",
                tkStampHuman(t).c_str(), r.score, trig, base.c_str());

  // 1) UXGA 스냅샷(시각 오버레이 시도) — FR-2.2 / 2.5
  bool nightFlash = false;   // (조도 판단 생략, 옵션) 필요 시 camFlash(true) 펄스
  if (nightFlash) camFlash(true);
  uint8_t* snap = nullptr; size_t snapLen = 0; bool overlay = false;
  bool haveSnap = camSnapshot(FRAMESIZE_UXGA, 8, true, t, &snap, &snapLen, &overlay);
  if (nightFlash) camFlash(false);

  // 2) SD 저장: 스냅샷/메타 (+ 클립)
  String jpgPath = base + ".jpg", jsonPath = base + ".json", aviPath = base + ".avi";
  if (haveSnap) storageWriteFile(jpgPath, snap, snapLen);

  // 메타 JSON — 감지시각 5중 기록 중 (파일명·메타) 담당 (FR-4.7)
  DynamicJsonDocument meta(1024);
  meta["detectedAt"]  = iso;
  meta["epoch"]       = tkEpoch(t);
  meta["timeSynced"]  = g_rt.timeSynced;
  meta["uptimeMs"]    = tkUptimeMs();
  meta["trigger"]     = trig;
  meta["score"]       = r.score;
  meta["hitCount"]    = hit;
  meta["overlay"]     = overlay;
  meta["device"]      = g_cfg.deviceName;
  meta["snapshot"]    = jpgPath;
  meta["clip"]        = g_cfg.clipEnabled ? aviPath : "";
  meta["protected"]   = false;
  { String ms; serializeJson(meta, ms);
    storageWriteFile(jsonPath, (const uint8_t*)ms.c_str(), ms.length()); }

  if (!g_rt.timeSynced) s_unsynced.push_back({jsonPath, tkUptimeMs()});

  // 3) 클립 녹화 (전방)
  if (g_cfg.clipEnabled) recordClip(aviPath);

  // 4) 텔레그램 사진 즉시 전송(≤8초 목표) — 캡션에 감지시각 (FR-5.1/5.3)
  String caption = buildCaption(iso, trig, r.score, base, hit);
  if (haveSnap) notifyEvent(caption, snap, snapLen);
  else notifySystem(caption + "\n(스냅샷 캡처 실패)");

  // 5) 클라우드 인제스트 + 원본 업로드 (FR-5.4)
  if (portalConnected() && strlen(g_cfg.cloudUrl)) {
    // 소형 썸네일(SVGA) 별도 캡처
    uint8_t* thumb = nullptr; size_t thumbLen = 0; bool ov2 = false;
    camSnapshot(FRAMESIZE_SVGA, 15, false, t, &thumb, &thumbLen, &ov2);
    String id = cloudIngestEvent(iso, tkEpoch(t), g_rt.timeSynced, trig, r.score, hit,
                                 jpgPath, thumb, thumbLen);
    if (thumb) free(thumb);
    if (id.length()) {
      if (haveSnap) cloudUploadMedia(id, "snapshot", snap, snapLen, "image/jpeg");
      // 클립은 상한(1.5MB) 내에서만 업로드, 초과 시 SD/로컬 링크 의존
      size_t clen = 0;
      uint8_t* cbuf = readFile(aviPath, &clen, 1500000);
      if (cbuf) { cloudUploadMedia(id, "clip", cbuf, clen, "video/x-msvideo"); free(cbuf); }
    }
  }

  if (snap) free(snap);

  // 6) 저장 후 용량 점검
  if (storageFreeLow()) {
    int n = storagePurge();
    if (n) notifySystem("💾 순환삭제 " + String(n) + "개 폴더 (SD " + String(g_rt.sdUsedPct) + "%)");
  }

  esp_task_wdt_add(NULL);   // 워치독 감시 복원
}

// ─── NTP 미동기 이벤트 소급보정 (FR-4.7) ───────────────────────────────────
static void handleUnsyncedCorrection() {
  bool synced = tkSynced();
  if (synced && !s_wasSynced && !s_unsynced.empty()) {
    Serial.printf("[time] 동기 완료 → 미동기 이벤트 %u건 시각 보정\n", (unsigned)s_unsynced.size());
    for (auto& u : s_unsynced) {
      if (!SD_MMC.exists(u.jsonPath)) continue;
      // 보정 시각 = bootEpoch + 이벤트 당시 uptime
      time_t corrected = (time_t)g_rt.bootEpoch + u.uptimeMs / 1000;
      File f = SD_MMC.open(u.jsonPath, FILE_READ);
      DynamicJsonDocument m(1024);
      if (f && !deserializeJson(m, f)) {
        f.close();
        m["detectedAt"] = tkStampISO(corrected);
        m["epoch"]      = (uint32_t)corrected;
        m["timeSynced"] = true;
        m["corrected"]  = true;
        File w = SD_MMC.open(u.jsonPath, FILE_WRITE);
        if (w) { serializeJson(m, w); w.close(); }
      } else if (f) f.close();
    }
    s_unsynced.clear();
  }
  s_wasSynced = synced;
}

// ─── setup ─────────────────────────────────────────────────────────────────
void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);   // brownout 감지 완화(전원 여유 없을 때 리셋루프 방지, R1)
  Serial.begin(115200);
  delay(300);
  Serial.printf("\n\n=== %s v%s (%s) ===\n", FW_NAME, FW_VERSION, FW_BUILD);

  pinMode(PIN_LED_STATUS, OUTPUT); digitalWrite(PIN_LED_STATUS, HIGH);

  // 1) WiFi 캡티브 포털(스킬 기반) — 팩토리리셋 체크 + 설정 로드 + 연결 + 토큰검증
  portalBegin();

  // 2) WiFi 이후 초기화 (스킬 가이드: 연결 후 NTP/서버)
  tkBegin();                    // ★ NTP 강제 동기 (감지시각 무결성)
  bool cam = camInit();         // 카메라
  storageBegin();               // SD_MMC (실패해도 계속 — FR-3.6)
  motionBegin();
  notifyBegin();
  cloudBegin();
  otaBegin();
  if (portalConnected()) webBegin();

  // 3) 자가점검 통과 시 OTA 이미지 유효 확정(롤백 취소) — FR-6.3.3
  if (cam && portalConnected()) otaMarkValidAfterSelfTest();

  // 4) 워치독 (FR-8.1) — 코어가 이미 짧은 타임아웃으로 init 했으므로 reconfigure로 60초 적용
#if defined(ESP_ARDUINO_VERSION) && ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3,0,0)
  esp_task_wdt_config_t wcfg = { .timeout_ms = WDT_TIMEOUT_SEC * 1000, .idle_core_mask = 0, .trigger_panic = true };
  if (esp_task_wdt_reconfigure(&wcfg) != ESP_OK) esp_task_wdt_init(&wcfg);  // 이미 init됨 → 재설정
#else
  esp_task_wdt_init(WDT_TIMEOUT_SEC, true);
#endif
  esp_task_wdt_add(NULL);

  // 5) 부팅 알림 (FR-5.8)
  String boot = "🟢 " + String(g_cfg.deviceName) + " 부팅 완료\n";
  boot += "v" + String(FW_VERSION) + " · IP " + String(g_rt.ipAddr) + "\n";
  boot += "카메라 " + String(cam ? "OK" : "실패") + " · SD " + String(g_rt.sdMounted ? "OK" : "없음");
  boot += " · 시각 " + String(g_rt.timeSynced ? "동기" : "미동기");
  boot += " · 플래시 " + String(g_rt.flashKB) + "KB(" + g_rt.partScheme + ")";
  notifySystem(boot);

  Serial.println(F("=== setup 완료, 감시 시작 ===\n"));
}

// ─── loop (협조적 슈퍼루프) ────────────────────────────────────────────────
void loop() {
  esp_task_wdt_reset();
  portalLoop();                 // 재연결/시리얼/AP LED
  tkLoop();
  handleUnsyncedCorrection();

  if (portalConnected()) {
    notifyPoll();               // 텔레그램 명령
    cloudHeartbeat();           // 1분 상태 보고 + 원격명령
    otaLoop();                  // ArduinoOTA + 자동확인
    if (millis() - s_lastFlush > 30000) { s_lastFlush = millis(); notifyFlushQueue(); }
  }

  webLoop();                    // /stream 은 세션 동안 블록(단일 카메라, FR-7)

  // 모션 판정 (≤1초, 스트림 중이 아닐 때)
  if (millis() - s_lastDetect > 700) {
    s_lastDetect = millis();
    MotionResult r = motionCheck();
    if (r.triggered) handleEvent(r);
  }

  // 주기 용량 점검
  if (millis() - s_lastPurge > 60000) {
    s_lastPurge = millis();
    if (storageFreeLow()) {
      int n = storagePurge();
      if (n) notifySystem("💾 순환삭제 " + String(n) + "개 폴더");
    }
  }
}
