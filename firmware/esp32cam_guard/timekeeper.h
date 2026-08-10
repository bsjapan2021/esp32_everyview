#pragma once
// ============================================================================
//  timekeeper — NTP 동기화 / KST 시각 포맷 ★ (감지시각은 제품 필수 요구)
//  FR-4.7: 파일명·메타·오버레이·캡션·클라우드 5곳에 동일 KST 시각 기록.
// ============================================================================
#include <Arduino.h>

void   tkBegin();                       // NTP 설정 + 최초 동기화 시도(비차단 후속 동기)
void   tkLoop();                        // 주기적 재동기 확인
bool   tkSynced();                      // NTP 동기 완료 여부
time_t tkNow();                         // 현재 epoch (KST 반영 없음, UTC 기준 time_t)

// 포맷터 — 모두 KST(tzOffset) 반영
String tkStampFile(time_t t = 0);       // "20260810_143207"      (파일명용)
String tkStampHuman(time_t t = 0);      // "2026-08-10 14:32:07"  (오버레이/캡션)
String tkStampISO(time_t t = 0);        // "2026-08-10T14:32:07+09:00" (ISO8601)
String tkDateFolder(time_t t = 0);      // "2026-08-10"           (DCIM 날짜 폴더)
uint32_t tkEpoch(time_t t = 0);         // epoch 초

// 부팅 후 경과(ms) — 미동기 이벤트 보정용 (FR-4.7)
uint32_t tkUptimeMs();
