#include "motion.h"
#include "appstate.h"
#include "camera.h"
#include "timekeeper.h"
#include "img_converters.h"

// 감지 그리드 = 마스크 존과 동일 8(가로) x 6(세로) — 마스크 편집기와 1:1 대응(FR-4.5)
static const int GW = 8, GH = 6;
static uint16_t s_prev[GW * GH];        // 직전 프레임 블록 평균
static bool     s_hasPrev = false;
static uint32_t s_lastEventEpoch = 0;   // 마지막 이벤트 시각(쿨다운 기준)
static uint16_t s_hitCount = 0;
static TriggerType s_forced = TRIG_NONE;

const char* triggerName(TriggerType t) {
  switch (t) {
    case TRIG_MOTION:   return "motion";
    case TRIG_PIR:      return "pir";
    case TRIG_BOTH:     return "both";
    case TRIG_MANUAL:   return "manual";
    case TRIG_SCHEDULE: return "schedule";
    default:            return "none";
  }
}

void motionBegin() {
  memset(s_prev, 0, sizeof(s_prev));
  s_hasPrev = false;
  s_hitCount = 0;
  if (g_cfg.pirEnabled) pinMode(PIN_PIR, INPUT);
}

uint16_t motionHitCount() { return s_hitCount; }
void motionForce(TriggerType t) { s_forced = t; }

// 감시 스케줄: 활성 시간대(예 19:00~07:00, 야간은 자정 넘김)와 요일 마스크 (FR-4.6)
bool motionScheduleActive() {
  if (!g_cfg.scheduleEnabled) return true;
  time_t now = tkNow();
  time_t shifted = now + (time_t)g_cfg.tzOffsetMin * 60;
  struct tm b; gmtime_r(&shifted, &b);
  uint8_t hour = b.tm_hour;
  uint8_t wday = b.tm_wday;                 // 0=일
  if (!(g_cfg.schedDaysMask & (1 << wday))) return false;
  uint8_t s = g_cfg.schedStartHour, e = g_cfg.schedEndHour;
  if (s == e) return true;
  if (s < e)  return hour >= s && hour < e;         // 같은 날 구간
  return hour >= s || hour < e;                     // 자정 넘김(야간)
}

// 감도 1~10 → 변화블록 비율 임계 0.20~0.02 (FR-4.2)
static float thresholdFromSens() {
  int sens = constrain((int)g_cfg.motionSens, 1, 10);
  return 0.20f - (sens - 1) * (0.18f / 9.0f);
}

// 현재 프레임을 축소 디코딩해 8x6 블록 평균 그레이 그리드 계산.
static bool computeGrid(uint16_t* grid) {
  camera_fb_t* fb = camCapture();
  if (!fb) return false;
  int outW = fb->width / 8, outH = fb->height / 8;      // JPG_SCALE_8 로 축소
  if (outW < GW || outH < GH) { outW = fb->width / 4; outH = fb->height / 4; }
  size_t rgbLen = (size_t)outW * outH * 2;
  uint8_t* rgb = (uint8_t*)malloc(rgbLen);
  if (!rgb) rgb = (uint8_t*)ps_malloc(rgbLen);
  if (!rgb) { camReturn(fb); return false; }
  esp_jpeg_image_scale_t scale = (fb->width / 8 >= GW) ? JPG_SCALE_8X : JPG_SCALE_4X;
  bool ok = jpg2rgb565(fb->buf, fb->len, rgb, scale);
  camReturn(fb);
  if (!ok) { free(rgb); return false; }

  // 8x6 셀별 그레이 평균
  uint32_t acc[GW * GH]; uint32_t cnt[GW * GH];
  memset(acc, 0, sizeof(acc)); memset(cnt, 0, sizeof(cnt));
  for (int y = 0; y < outH; y++) {
    int gy = y * GH / outH;
    for (int x = 0; x < outW; x++) {
      int gx = x * GW / outW;
      size_t o = (size_t)(y * outW + x) * 2;
      uint16_t px = (uint16_t)rgb[o] << 8 | rgb[o + 1];
      uint8_t r = (px >> 11) & 0x1F, g = (px >> 5) & 0x3F, b = px & 0x1F;
      uint16_t gray = (r * 8 + g * 4 + b * 8) / 3;   // 근사 휘도(0~255 근방)
      int idx = gy * GW + gx;
      acc[idx] += gray; cnt[idx]++;
    }
  }
  free(rgb);
  for (int i = 0; i < GW * GH; i++) grid[i] = cnt[i] ? acc[i] / cnt[i] : 0;
  return true;
}

MotionResult motionCheck() {
  MotionResult res;
  uint32_t nowEpoch = tkEpoch();

  // 수동 강제 트리거 우선 처리
  if (s_forced != TRIG_NONE) {
    res.triggered = true; res.trigger = s_forced; res.score = 0;
    s_forced = TRIG_NONE;
    s_lastEventEpoch = nowEpoch; s_hitCount = 1;
    return res;
  }

  // 스케줄 비활성 시간대 → 트리거 무시 (FR-4.6)
  if (!motionScheduleActive()) return res;

  // PIR (옵션) — FR-4.3
  bool pir = g_cfg.pirEnabled && digitalRead(PIN_PIR) == HIGH;

  // 프레임 차분
  bool motion = false; uint8_t score = 0;
  uint16_t grid[GW * GH];
  if (computeGrid(grid)) {
    if (s_hasPrev) {
      int changed = 0, active = 0;
      for (int row = 0; row < GH; row++) {
        uint8_t maskRow = g_cfg.maskZone[row];        // 1비트=무시 셀
        for (int col = 0; col < GW; col++) {
          int idx = row * GW + col;
          if (maskRow & (1 << col)) continue;         // 마스크된 셀 제외
          active++;
          int diff = abs((int)grid[idx] - (int)s_prev[idx]);
          if (diff > 18) changed++;                   // 셀 변화 임계(그레이 레벨)
        }
      }
      float ratio = active ? (float)changed / active : 0.0f;
      score = (uint8_t)constrain((int)(ratio * 100.0f), 0, 100);
      motion = ratio > thresholdFromSens();
    }
    memcpy(s_prev, grid, sizeof(grid));
    s_hasPrev = true;
  }

  res.score = score;
  if (!motion && !pir) return res;                    // 아무 트리거 없음

  // 트리거 종류 결정
  TriggerType tt = (motion && pir) ? TRIG_BOTH : (motion ? TRIG_MOTION : TRIG_PIR);

  // 쿨다운 처리 (FR-4.4) — 쿨다운 중이면 hitCount 누적, 새 이벤트 아님
  if (s_lastEventEpoch && (nowEpoch - s_lastEventEpoch) < g_cfg.cooldownSec) {
    s_hitCount++;
    res.inCooldown = true; res.trigger = tt;
    return res;
  }

  // 새 이벤트 확정
  s_lastEventEpoch = nowEpoch;
  s_hitCount = 1;
  res.triggered = true; res.trigger = tt;
  return res;
}
