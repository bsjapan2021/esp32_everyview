#pragma once
// ============================================================================
//  otaupd — ArduinoOTA(로컬) + HTTPS GitHub Release OTA(원격) (FR-6)
//   4MB 양면 파티션 · SHA-256 검증 · 자가점검 후 유효표시/롤백.
// ============================================================================
#include <Arduino.h>

void otaBegin();                    // ArduinoOTA 셋업 + 플래시/파티션 리포트
void otaLoop();                     // ArduinoOTA.handle() + 주기 자동확인(적용 OFF)
void otaCheckAndApply(bool force);  // manifest 비교 → 다운로드 → 검증 → 재부팅
void otaMarkValidAfterSelfTest();   // 부팅 자가점검 통과 시 이미지 유효 확정 (FR-6.3.3)
void otaReportFlashInfo();          // 감지 플래시 크기·파티션 스킴 → g_rt/로그
