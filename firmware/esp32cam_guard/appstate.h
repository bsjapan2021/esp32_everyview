#pragma once
// ============================================================================
//  appstate.h — 모듈 공유 설정(Config) + 런타임 상태(Runtime)
//  순환 include 방지를 위해 모든 모듈이 참조하는 단일 상태 정의.
// ============================================================================
#include <Arduino.h>
#include "config.h"

// ─── 사용자 설정 (NVS 저장, 포털/대시보드에서 변경) — FR-1.3 / FR-4 ─────────
struct Config {
  // 장치
  char     deviceName[32]  = DEFAULT_DEVICE_NAME;
  char     deviceKey[40]   = "";                 // 32자 인증키 (자동생성)
  char     location[48]    = "";                 // 설치 위치(대시보드에서 입력)

  // 텔레그램
  char     tgToken[64]     = "";                 // 봇 토큰
  char     tgChatId[24]    = "";                 // 숫자 chat_id (전송 대상)
  char     tgUsername[40]  = DEFAULT_TG_USERNAME;// @사용자명 (식별/검증)

  // 클라우드
  char     cloudUrl[128]   = DEFAULT_CLOUD_URL;

  // 감지
  uint8_t  motionSens      = DEFAULT_MOTION_SENS;   // 1~10
  uint16_t cooldownSec     = DEFAULT_COOLDOWN_SEC;  // 5~300
  uint8_t  clipSec         = DEFAULT_CLIP_SEC;      // 1~15
  bool     clipEnabled     = true;
  uint8_t  maskZone[6]     = {0,0,0,0,0,0};         // 8x6 그리드, 행별 8비트 (1=무시) FR-4.5
  bool     scheduleEnabled = false;                 // FR-4.6
  uint8_t  schedStartHour  = 19;
  uint8_t  schedEndHour    = 7;
  uint8_t  schedDaysMask   = 0x7F;                  // bit0=일 ... bit6=토

  // 시각
  int16_t  tzOffsetMin     = DEFAULT_TZ_OFFSET_MIN; // 분 (KST=540)

  // 옵션
  bool     pirEnabled      = false;                 // PIR 연결 시 true
  bool     tlsInsecure     = TLS_ALLOW_INSECURE_FALLBACK; // FR-5.9
  bool     continuousRec   = false;                 // 상시 녹화 (FR-2.6)
  bool     heartbeatDaily  = true;                  // 24h 무이벤트 하트비트

  // AP 커스텀 (FR-1.1.2)
  char     apSsid[24]      = AP_SSID_BASE;
  char     apPassword[24]  = AP_PASSWORD;
};

// ─── 런타임 상태 (휘발성) ──────────────────────────────────────────────────
struct Runtime {
  bool      wifiConnected   = false;
  bool      timeSynced      = false;     // NTP 동기 여부 (FR-4.7)
  bool      sdMounted       = false;
  bool      psramFound      = false;
  bool      cameraReady     = false;
  int8_t    rssi            = 0;
  uint8_t   sdUsedPct       = 0;
  uint64_t  sdTotalBytes    = 0;
  uint64_t  sdUsedBytes     = 0;
  uint32_t  eventCount      = 0;         // 부팅 이후 이벤트 수
  uint32_t  bootEpoch       = 0;         // 부팅 시각(동기화 후 확정)
  uint32_t  muteUntilEpoch  = 0;         // 텔레그램 음소거 만료
  uint32_t  flashKB         = 0;         // 감지된 플래시 크기 (FR-6.3.2)
  char      partScheme[24]  = "ota_4mb"; // 사용 파티션 스킴
  char      ipAddr[16]      = "0.0.0.0";
  uint8_t   unauthCount     = 0;         // 미인가 텔레그램 접근 (FR-5.6)
};

// ─── 전역 인스턴스 (esp32cam_guard.ino 에서 정의) ──────────────────────────
extern Config  g_cfg;
extern Runtime g_rt;

// 토큰/키 마스킹 유틸 (로그·API 응답 공용) — FR-5.0.5 / 비기능 보안
inline String maskSecret(const char* s) {
  String v(s);
  if (v.length() <= 8) return v.length() ? "****" : "";
  return v.substring(0, 6) + "…" + v.substring(v.length() - 3);
}
