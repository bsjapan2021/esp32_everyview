#include "portal.h"
#include "appstate.h"
#include "secrets.h"
#include <WiFi.h>
#include <WiFiManager.h>      // tzapu — 스킬 의존성
#include <Preferences.h>
#include <Ticker.h>
#include "esp_system.h"

// notify 모듈 검증 훅 (약결합)
extern bool notifyValidateToken();
extern bool notifySendText(const String& msg);

static Preferences s_prefs;
static Ticker      s_ledTicker;
static bool        s_apMode = false;

// ─── 상태 LED(AP 모드 1초 점멸) — FR-1.1.3 ─────────────────────────────────
static void ledToggle() {
  static bool on = false; on = !on;
  digitalWrite(PIN_LED_STATUS, on ? LOW : HIGH);   // 온보드 LED는 LOW=ON
}
static void apLedStart() { pinMode(PIN_LED_STATUS, OUTPUT); s_ledTicker.attach(1.0, ledToggle); }
static void apLedStop()  { s_ledTicker.detach(); digitalWrite(PIN_LED_STATUS, HIGH); }

// ─── device_key 자동 생성(32 hex) — FR-1.3 ────────────────────────────────
static void generateDeviceKey(char* out) {
  const char* hex = "0123456789abcdef";
  for (int i = 0; i < 32; i++) out[i] = hex[esp_random() & 0xF];
  out[32] = 0;
}

// ─── NVS 로드/저장 ─────────────────────────────────────────────────────────
void portalLoadConfig() {
  s_prefs.begin("guard", true);          // 읽기전용
  s_prefs.getString("deviceName", g_cfg.deviceName, sizeof(g_cfg.deviceName));
  s_prefs.getString("deviceKey",  g_cfg.deviceKey,  sizeof(g_cfg.deviceKey));
  s_prefs.getString("location",   g_cfg.location,   sizeof(g_cfg.location));
  s_prefs.getString("tgToken",    g_cfg.tgToken,    sizeof(g_cfg.tgToken));
  s_prefs.getString("tgChatId",   g_cfg.tgChatId,   sizeof(g_cfg.tgChatId));
  s_prefs.getString("tgUsername", g_cfg.tgUsername, sizeof(g_cfg.tgUsername));
  s_prefs.getString("cloudUrl",   g_cfg.cloudUrl,   sizeof(g_cfg.cloudUrl));
  s_prefs.getString("apSsid",     g_cfg.apSsid,     sizeof(g_cfg.apSsid));
  s_prefs.getString("apPassword", g_cfg.apPassword, sizeof(g_cfg.apPassword));
  g_cfg.motionSens  = s_prefs.getUChar("motionSens", g_cfg.motionSens);
  g_cfg.cooldownSec = s_prefs.getUShort("cooldownSec", g_cfg.cooldownSec);
  g_cfg.clipSec     = s_prefs.getUChar("clipSec", g_cfg.clipSec);
  g_cfg.tzOffsetMin = s_prefs.getShort("tzOffset", g_cfg.tzOffsetMin);
  g_cfg.pirEnabled  = s_prefs.getBool("pir", g_cfg.pirEnabled);
  g_cfg.tlsInsecure = s_prefs.getBool("tlsInsecure", g_cfg.tlsInsecure);
  g_cfg.clipEnabled = s_prefs.getBool("clipEnabled", g_cfg.clipEnabled);
  s_prefs.getBytes("maskZone", g_cfg.maskZone, sizeof(g_cfg.maskZone));
  s_prefs.end();

  // secrets.h 폴백(개발 편의): NVS가 비었을 때만 사용
  if (strlen(g_cfg.tgToken) == 0 && strlen(SECRET_TG_TOKEN) > 0)
    strlcpy(g_cfg.tgToken, SECRET_TG_TOKEN, sizeof(g_cfg.tgToken));
  if (strlen(g_cfg.tgChatId) == 0 && strlen(SECRET_TG_CHAT_ID) > 0)
    strlcpy(g_cfg.tgChatId, SECRET_TG_CHAT_ID, sizeof(g_cfg.tgChatId));

  // device_key 없으면 생성/저장
  if (strlen(g_cfg.deviceKey) < 32) {
    if (strlen(SECRET_DEVICE_KEY) >= 32) strlcpy(g_cfg.deviceKey, SECRET_DEVICE_KEY, sizeof(g_cfg.deviceKey));
    else generateDeviceKey(g_cfg.deviceKey);
    portalSaveConfig();
    Serial.printf("[portal] device_key 생성: %s\n", maskSecret(g_cfg.deviceKey).c_str());
  }
}

void portalSaveConfig() {
  s_prefs.begin("guard", false);
  s_prefs.putString("deviceName", g_cfg.deviceName);
  s_prefs.putString("deviceKey",  g_cfg.deviceKey);
  s_prefs.putString("location",   g_cfg.location);
  s_prefs.putString("tgToken",    g_cfg.tgToken);
  s_prefs.putString("tgChatId",   g_cfg.tgChatId);
  s_prefs.putString("tgUsername", g_cfg.tgUsername);
  s_prefs.putString("cloudUrl",   g_cfg.cloudUrl);
  s_prefs.putString("apSsid",     g_cfg.apSsid);
  s_prefs.putString("apPassword", g_cfg.apPassword);
  s_prefs.putUChar("motionSens",  g_cfg.motionSens);
  s_prefs.putUShort("cooldownSec",g_cfg.cooldownSec);
  s_prefs.putUChar("clipSec",     g_cfg.clipSec);
  s_prefs.putShort("tzOffset",    g_cfg.tzOffsetMin);
  s_prefs.putBool("pir",          g_cfg.pirEnabled);
  s_prefs.putBool("tlsInsecure",  g_cfg.tlsInsecure);
  s_prefs.putBool("clipEnabled",  g_cfg.clipEnabled);
  s_prefs.putBytes("maskZone",    g_cfg.maskZone, sizeof(g_cfg.maskZone));
  s_prefs.end();
}

// ─── 팩토리 리셋 — FR-1.5 (부팅 시점 GPIO0 접지, 카메라 XCLK 공유이므로 부팅만) ─
static bool bootFactoryResetRequested() {
  pinMode(PIN_FACTORY_RST, INPUT_PULLUP);
  // 부팅 직후 5초 창에서 GND 접지 지속 확인
  uint32_t start = millis();
  bool held = true;
  while (millis() - start < 500) {           // 짧게 표본(카메라 아직 미초기화)
    if (digitalRead(PIN_FACTORY_RST) == HIGH) { held = false; break; }
    delay(20);
  }
  return held;   // 500ms 이상 접지 유지 시 리셋 의사로 간주(부팅 모드 진입과 구분 위해 추가 확인은 상위)
}

void portalFactoryReset() {
  Serial.println(F("[portal] 팩토리 리셋 → NVS/WiFi 초기화 후 재부팅"));
  s_prefs.begin("guard", false); s_prefs.clear(); s_prefs.end();
  WiFiManager wm; wm.resetSettings();
  delay(300);
  ESP.restart();
}

// ─── 커스텀 파라미터 정의 & 저장 콜백 ──────────────────────────────────────
static WiFiManager wm;
static WiFiManagerParameter* p_name;
static WiFiManagerParameter* p_token;
static WiFiManagerParameter* p_chat;
static WiFiManagerParameter* p_user;
static WiFiManagerParameter* p_cloud;
static WiFiManagerParameter* p_sens;
static WiFiManagerParameter* p_tz;
static WiFiManagerParameter* p_clip;

static void saveParamsCallback() {
  strlcpy(g_cfg.deviceName, p_name->getValue(),  sizeof(g_cfg.deviceName));
  strlcpy(g_cfg.tgToken,    p_token->getValue(), sizeof(g_cfg.tgToken));
  strlcpy(g_cfg.tgChatId,   p_chat->getValue(),  sizeof(g_cfg.tgChatId));
  strlcpy(g_cfg.tgUsername, p_user->getValue(),  sizeof(g_cfg.tgUsername));
  strlcpy(g_cfg.cloudUrl,   p_cloud->getValue(), sizeof(g_cfg.cloudUrl));
  int sens = atoi(p_sens->getValue()); if (sens >= 1 && sens <= 10) g_cfg.motionSens = sens;
  int tz = atoi(p_tz->getValue());     g_cfg.tzOffsetMin = tz;
  int cs = atoi(p_clip->getValue());   if (cs >= 1 && cs <= MAX_CLIP_SEC) g_cfg.clipSec = cs;
  if (strlen(g_cfg.deviceKey) < 32) generateDeviceKey(g_cfg.deviceKey);
  portalSaveConfig();
  Serial.println(F("[portal] 설정 저장(NVS)"));
}

static void apCallback(WiFiManager* w) {
  s_apMode = true;
  apLedStart();
  Serial.printf("[portal] AP 모드: \"%s\" (192.168.4.1) — LED 1초 점멸\n", g_cfg.apSsid);
}

static void setupParams() {
  char sens[4]; snprintf(sens, sizeof(sens), "%d", g_cfg.motionSens);
  char tz[8];   snprintf(tz, sizeof(tz), "%d", g_cfg.tzOffsetMin);
  char clip[4]; snprintf(clip, sizeof(clip), "%d", g_cfg.clipSec);
  p_name  = new WiFiManagerParameter("device_name", "장치 이름", g_cfg.deviceName, 31);
  p_token = new WiFiManagerParameter("tg_token", "텔레그램 봇 토큰", "", 63);   // 보안: 기존값 미표시
  p_chat  = new WiFiManagerParameter("tg_chat_id", "텔레그램 Chat ID(숫자, 비우면 자동)", g_cfg.tgChatId, 23);
  p_user  = new WiFiManagerParameter("tg_username", "수신자 텔레그램 ID", g_cfg.tgUsername, 39);
  p_cloud = new WiFiManagerParameter("cloud_url", "클라우드 수집 URL", g_cfg.cloudUrl, 127);
  p_sens  = new WiFiManagerParameter("motion_sens", "모션 민감도(1~10)", sens, 3);
  p_tz    = new WiFiManagerParameter("tz_offset", "표준시(분, KST=540)", tz, 7);
  p_clip  = new WiFiManagerParameter("clip_sec", "클립 길이(초)", clip, 3);
  wm.addParameter(p_name); wm.addParameter(p_token); wm.addParameter(p_chat);
  wm.addParameter(p_user); wm.addParameter(p_cloud); wm.addParameter(p_sens);
  wm.addParameter(p_tz);   wm.addParameter(p_clip);
  wm.setSaveParamsCallback(saveParamsCallback);
  wm.setAPCallback(apCallback);
  wm.setConnectTimeout(20);
  wm.setBreakAfterConfig(true);   // 저장 즉시 연결 시도
}

// ─── 부팅 진입점 ───────────────────────────────────────────────────────────
void portalBegin() {
  // 팩토리 리셋(부팅 시 GPIO0 접지). 카메라 초기화 이전에만 안전.
  if (bootFactoryResetRequested()) {
    Serial.println(F("[portal] 부팅 시 GPIO0 접지 감지 → 팩토리 리셋"));
    portalFactoryReset();
  }

  portalLoadConfig();

  WiFi.mode(WIFI_STA);
  WiFi.setHostname(WIFI_PORTAL_HOSTNAME);
  setupParams();

  bool hasCreds = wm.getWiFiSSID(true).length() > 0;
  bool apPwValid = strlen(g_cfg.apPassword) >= 8;

  if (!hasCreds) {
    // 최초 설정: 무제한 포털(스킬 원칙) — AP가 폰 목록에서 사라지지 않도록
    wm.setConfigPortalTimeout(0);
    Serial.println(F("[portal] 저장된 WiFi 없음 → 무제한 설정 포털"));
    if (apPwValid) wm.startConfigPortal(g_cfg.apSsid, g_cfg.apPassword);
    else           wm.startConfigPortal(g_cfg.apSsid);
  } else {
    // 저장된 자격으로 연결 시도, 실패 시 유한 포털(정전 복구 후 무한대기 방지, FR-1.2.2)
    wm.setConfigPortalTimeout(PORTAL_IDLE_REBOOT_SEC);
    bool ok = apPwValid ? wm.autoConnect(g_cfg.apSsid, g_cfg.apPassword)
                        : wm.autoConnect(g_cfg.apSsid);
    if (!ok) {
      Serial.println(F("[portal] 연결/포털 타임아웃 → 재부팅 후 재시도(WiFi 복구 대비)"));
      delay(500); ESP.restart();
    }
  }

  s_apMode = false; apLedStop();
  g_rt.wifiConnected = (WiFi.status() == WL_CONNECTED);
  if (g_rt.wifiConnected) {
    strlcpy(g_rt.ipAddr, WiFi.localIP().toString().c_str(), sizeof(g_rt.ipAddr));
    g_rt.rssi = WiFi.RSSI();
    Serial.printf("[portal] 연결됨: %s  IP %s  RSSI %d\n",
                  WiFi.SSID().c_str(), g_rt.ipAddr, g_rt.rssi);
    // 토큰 검증(getMe + 테스트 메시지) — FR-1.2.2 / FR-5.0.5
    if (strlen(g_cfg.tgToken) > 0) {
      if (notifyValidateToken()) { notifySendText(String("✅ ") + g_cfg.deviceName + " 설정 완료·연결됨"); }
      else Serial.println(F("[portal] ⚠ 텔레그램 토큰 검증 실패(getMe)"));
    }
  }
}

// ─── 온디맨드 포털 / 시리얼 / 루프 ─────────────────────────────────────────
void portalForce() {
  Serial.println(F("[portal] 온디맨드 설정 포털(유한 타임아웃)"));
  wm.setConfigPortalTimeout(WIFI_PORTAL_TIMEOUT_SEC);
  bool apPwValid = strlen(g_cfg.apPassword) >= 8;
  s_apMode = true; apLedStart();
  if (apPwValid) wm.startConfigPortal(g_cfg.apSsid, g_cfg.apPassword);
  else           wm.startConfigPortal(g_cfg.apSsid);
  s_apMode = false; apLedStop();
}

void portalHandleSerial() {
  if (!Serial.available()) return;
  char c = Serial.read();
  if (c == 'w') portalForce();
  else if (c == 'W') portalFactoryReset();
}

void portalLoop() {
  portalHandleSerial();
  static uint32_t lastRetry = 0;
  static uint8_t  failCount = 0;
  if (WiFi.status() != WL_CONNECTED) {
    g_rt.wifiConnected = false;
    if (millis() - lastRetry > WIFI_RETRY_INTERVAL_MS) {   // FR-8.2
      lastRetry = millis();
      WiFi.reconnect();
      if (++failCount >= WIFI_MAX_RETRY) { Serial.println(F("[portal] WiFi 10회 실패 → 재부팅")); ESP.restart(); }
    }
  } else {
    if (!g_rt.wifiConnected) {   // 방금 복구
      strlcpy(g_rt.ipAddr, WiFi.localIP().toString().c_str(), sizeof(g_rt.ipAddr));
      notifySendText(String("📶 ") + g_cfg.deviceName + " WiFi 재연결");
    }
    g_rt.wifiConnected = true;
    g_rt.rssi = WiFi.RSSI();
    failCount = 0;
  }
}

bool portalConnected() { return WiFi.status() == WL_CONNECTED; }
