#pragma once
// ============================================================================
//  motion — 프레임 차분 모션 엔진 (FR-4)
//   QQVGA급 축소 그레이스케일 → 8x6 블록 평균 → 직전 프레임 대비 변화율 판정.
//   PIR(OR) · 쿨다운 · 마스크 존 · 감시 스케줄 반영.
// ============================================================================
#include <Arduino.h>

enum TriggerType { TRIG_NONE, TRIG_MOTION, TRIG_PIR, TRIG_BOTH, TRIG_MANUAL, TRIG_SCHEDULE };
const char* triggerName(TriggerType t);

struct MotionResult {
  bool        triggered = false;   // 새 이벤트 발생(쿨다운 밖)
  TriggerType trigger   = TRIG_NONE;
  uint8_t     score     = 0;       // 변화 블록 비율 0~100
  bool        inCooldown = false;  // 쿨다운 중 재감지(hitCount 누적)
};

void         motionBegin();
MotionResult motionCheck();                    // 주기 호출(≤1초). 카메라 프레임 사용.
void         motionForce(TriggerType t);       // 수동 트리거(/api/capture, 텔레그램 /photo)
uint16_t     motionHitCount();                 // 현재 진행 이벤트 누적 감지 수
bool         motionScheduleActive();           // 현재 감시 활성 시간대 여부 (FR-4.6)
