#pragma once
// ============================================================================
//  ESP32CAM-Guard — 전역 설정 / 핀맵 / 기본값 / 버전
//  대상 보드: AI-Thinker ESP32-CAM (ESP32-S, PSRAM 필수)
//
//  ⚠️ 비밀정보(텔레그램 토큰 등)는 여기 넣지 말 것 → secrets.h 참조.
//  운영 값은 캡티브 포털 → NVS 저장이 정식 경로이며, 아래 값들은 "기본값/폴백".
// ============================================================================

// ─── 펌웨어 버전 (SemVer, OTA 비교 기준) ────────────────────────────────────
#define FW_VERSION      "1.4.4"
#define FW_BUILD        "20260811.5"
#define FW_NAME         "ESP32CAM-Guard"

// ─── 캡티브 포털(AP) 설정 — FR-1.1 ─────────────────────────────────────────
//  esp-wifi-portal 스킬(WiFiManager) 오버라이드 매크로. portal 모듈이 이 값을 사용.
#define AP_SSID_BASE            "EveryView-CAM"     // AP SSID (FR-1.1)
//  실제 AP 비밀번호는 secrets.h 의 SECRET_AP_PASSWORD 로 주입(공개 저장소 노출 방지).
//  아래는 secrets 미설정 시 폴백용 공개-안전 플레이스홀더(운영값 아님).
#define AP_PASSWORD             "EveryView-Setup"   // WPA2 폴백(플레이스홀더)
#define AP_SSID_SUFFIX_ENABLED  0              // 1이면 MAC 하위4자리 접미사 (FR-1.1.1)
#define AP_IP_OCT               192,168,4,1    // 고정 AP IP
#define AP_CHANNEL              1
#define AP_MAX_CONN             2

//  스킬 모듈(wifi_portal.*) 호환 오버라이드 (portal.cpp 에서 재정의될 수도 있음)
#define WIFI_PORTAL_AP_NAME       AP_SSID_BASE
#define WIFI_PORTAL_AP_PASSWORD   AP_PASSWORD
#define WIFI_PORTAL_HOSTNAME      "everyview-cam"
#define WIFI_PORTAL_TIMEOUT_SEC   180

// 설정 미완료 상태 자동 재부팅(정전 복구 후 무한 대기 방지) — FR-1.2.2
#define PORTAL_IDLE_REBOOT_SEC    300          // 5분

// ─── 상태/제어 핀 ──────────────────────────────────────────────────────────
#define PIN_LED_STATUS   33      // 온보드 빨강 LED (LOW=ON)
#define PIN_LED_FLASH    4       // 백색 플래시 LED (HIGH=ON) — SD_MMC와 배선 공유 주의
#define PIN_PIR          13      // HC-SR501 PIR (옵션) — FR-4.3
#define PIN_FACTORY_RST  0       // 부팅 시 GND 접지 = 팩토리 리셋 (카메라 XCLK 공유, 부팅시점만) FR-1.5

// ─── AI-Thinker ESP32-CAM 카메라 핀맵 (OV2640) ─────────────────────────────
#define CAM_PIN_PWDN     32
#define CAM_PIN_RESET    -1
#define CAM_PIN_XCLK      0
#define CAM_PIN_SIOD     26
#define CAM_PIN_SIOC     27
#define CAM_PIN_Y9       35
#define CAM_PIN_Y8       34
#define CAM_PIN_Y7       39
#define CAM_PIN_Y6       36
#define CAM_PIN_Y5       21
#define CAM_PIN_Y4       19
#define CAM_PIN_Y3       18
#define CAM_PIN_Y2        5
#define CAM_PIN_VSYNC    25
#define CAM_PIN_HREF     23
#define CAM_PIN_PCLK     22
#define XCLK_FREQ_HZ     20000000

// ─── microSD (SD_MMC 1-bit 모드 고정) — HW 요구 ────────────────────────────
//  1-bit: CLK=14, CMD=15, D0=2  (4-bit는 GPIO4 플래시와 충돌하므로 미사용)
#define SD_ONE_BIT_MODE  true

// ─── 시각 / NTP — FR-4.7, timekeeper ───────────────────────────────────────
#define NTP_SERVER_1     "kr.pool.ntp.org"
#define NTP_SERVER_2     "time.google.com"
#define NTP_SERVER_3     "pool.ntp.org"
#define DEFAULT_TZ_OFFSET_MIN   540           // KST = UTC+9 = 540분 (tz_offset 기본)

// ─── 이벤트 감지 기본값 — FR-4 ─────────────────────────────────────────────
#define DEFAULT_MOTION_SENS     5             // 1~10 (FR-4.2)
#define DEFAULT_COOLDOWN_SEC    20            // 5~300 (FR-4.4)
#define DEFAULT_CLIP_SEC        5             // 1~15 (FR-2.3)
#define MAX_CLIP_SEC            15
#define PREROLL_SEC             2             // 프리롤 링버퍼 (FR-2.3)

// ─── 순환 저장 임계치 — FR-3 ───────────────────────────────────────────────
#define STORAGE_MIN_FREE_PCT    15            // 이하이면 정리 (FR-3.2)
#define STORAGE_MIN_FREE_MB     300           // 또는 절대 여유 300MB 미만
#define STORAGE_RECOVER_PCT     25            // 이만큼 회복할 때까지 삭제 (FR-3.3)

// ─── 클라우드 인제스트 — FR-5.4 / 5.5 ──────────────────────────────────────
#define DEFAULT_CLOUD_URL       "https://esp32cam-guard.vercel.app/api/ingest"
#define HEARTBEAT_INTERVAL_MS   60000         // 1분 (온라인 판정 3분)

// ─── 텔레그램 기본 표시값 — FR-5.0 ─────────────────────────────────────────
#define DEFAULT_TG_USERNAME     "@Kasaonohoshi"   // 수신자 식별/검증용 (전송은 chat_id)

// ─── 장치 기본값 — FR-1.3 ──────────────────────────────────────────────────
#define DEFAULT_DEVICE_NAME     "CAM-01"

// ─── 안정성 — FR-8 ─────────────────────────────────────────────────────────
#define WDT_TIMEOUT_SEC         60            // TWDT (FR-8.1) — 네트워크 블로킹 여유 확보
#define WIFI_RETRY_INTERVAL_MS  10000         // (FR-8.2)
#define WIFI_MAX_RETRY          10            // 10회 실패 시 재부팅
#define HEAP_MIN_STREAM_BYTES   40000         // 힙 40KB 미만 시 스트림 종료 (FR-8.4)

// ─── OTA — FR-6 ────────────────────────────────────────────────────────────
#define OTA_MANIFEST_URL  "https://github.com/bsjapan2021/esp32_everyview/releases/latest/download/manifest.json"
#define OTA_CHECK_INTERVAL_MS   (24UL * 3600UL * 1000UL)  // 24시간 (자동적용 OFF)
#define OTA_AUTO_APPLY          false

// ─── TLS — FR-5.9 ──────────────────────────────────────────────────────────
#define TLS_ALLOW_INSECURE_FALLBACK  false    // 기본 OFF, 포털에서 토글

// ─── SD 파일 경로 규칙 — FR-2.4 ────────────────────────────────────────────
#define DIR_DCIM     "/DCIM"
#define DIR_LOG      "/LOG"
#define DIR_QUEUE    "/QUEUE"
#define DIR_REC      "/REC"
#define PATH_CONFIG_BACKUP  "/config.json"    // NVS 백업 (FR-1.4)
