#include "timekeeper.h"
#include "appstate.h"
#include <time.h>

static bool     s_synced      = false;
static uint32_t s_lastCheck   = 0;
static uint32_t s_bootMillis  = 0;

// KST 오프셋을 반영해 broken-down time 을 얻는다.
// configTime 으로 gmtoffset 을 넣지 않고, 내부적으로 UTC 로 관리한 뒤 포맷 시 오프셋 가산.
// (tz_offset 이 런타임 변경되어도 재설정 없이 반영되도록 오프셋 가산 방식 채택)
static struct tm localBrokenDown(time_t t) {
  if (t == 0) t = time(nullptr);
  time_t shifted = t + (time_t)g_cfg.tzOffsetMin * 60;
  struct tm out;
  gmtime_r(&shifted, &out);   // shifted 를 UTC 로 풀면 = 지역시각
  return out;
}

void tkBegin() {
  s_bootMillis = millis();
  // 서버 3개 등록, UTC 기준(offset 0)으로 동기 — 지역 변환은 포맷 단계에서 수행
  configTime(0, 0, NTP_SERVER_1, NTP_SERVER_2, NTP_SERVER_3);
  Serial.println(F("[time] NTP 동기 요청 (kr.pool.ntp.org ...)"));

  // 부팅 시 강제 동기 짧게 대기 (최대 8초) — FR-4.7 / R5
  uint32_t start = millis();
  while (time(nullptr) < 1700000000UL && millis() - start < 8000) {
    delay(200);
  }
  s_synced = time(nullptr) > 1700000000UL;  // 2023-11 이후면 동기 성공으로 간주
  g_rt.timeSynced = s_synced;
  if (s_synced) {
    g_rt.bootEpoch = (uint32_t)time(nullptr) - (millis() - s_bootMillis) / 1000;
    Serial.printf("[time] 동기 완료: %s\n", tkStampHuman().c_str());
  } else {
    Serial.println(F("[time] 미동기 — 이벤트에 TIME_UNSYNCED 표기, 동기 후 소급 보정"));
  }
}

void tkLoop() {
  // 5분마다 동기 상태 확인 (미동기였다면 재확인해 소급 보정 트리거는 상위에서)
  if (millis() - s_lastCheck < 300000UL) return;
  s_lastCheck = millis();
  bool now = time(nullptr) > 1700000000UL;
  if (now && !s_synced) {
    s_synced = true;
    g_rt.timeSynced = true;
    g_rt.bootEpoch = (uint32_t)time(nullptr) - millis() / 1000;
    Serial.printf("[time] 지연 동기 완료: %s\n", tkStampHuman().c_str());
  }
}

bool   tkSynced() { return s_synced; }
time_t tkNow()    { return time(nullptr); }

String tkStampFile(time_t t) {
  struct tm b = localBrokenDown(t);
  char buf[20];
  snprintf(buf, sizeof(buf), "%04d%02d%02d_%02d%02d%02d",
           b.tm_year + 1900, b.tm_mon + 1, b.tm_mday, b.tm_hour, b.tm_min, b.tm_sec);
  return String(buf);
}

String tkStampHuman(time_t t) {
  struct tm b = localBrokenDown(t);
  char buf[24];
  snprintf(buf, sizeof(buf), "%04d-%02d-%02d %02d:%02d:%02d",
           b.tm_year + 1900, b.tm_mon + 1, b.tm_mday, b.tm_hour, b.tm_min, b.tm_sec);
  return String(buf);
}

String tkStampISO(time_t t) {
  struct tm b = localBrokenDown(t);
  int off = g_cfg.tzOffsetMin;
  char sign = off >= 0 ? '+' : '-';
  int aoff = off >= 0 ? off : -off;
  char buf[32];
  snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02d%c%02d:%02d",
           b.tm_year + 1900, b.tm_mon + 1, b.tm_mday, b.tm_hour, b.tm_min, b.tm_sec,
           sign, aoff / 60, aoff % 60);
  return String(buf);
}

String tkDateFolder(time_t t) {
  struct tm b = localBrokenDown(t);
  char buf[12];
  snprintf(buf, sizeof(buf), "%04d-%02d-%02d", b.tm_year + 1900, b.tm_mon + 1, b.tm_mday);
  return String(buf);
}

uint32_t tkEpoch(time_t t)   { return (uint32_t)(t == 0 ? time(nullptr) : t); }
uint32_t tkUptimeMs()        { return millis() - s_bootMillis; }
