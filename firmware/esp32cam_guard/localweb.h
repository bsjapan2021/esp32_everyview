#pragma once
// ============================================================================
//  webserver — 로컬 HTTP :80 (/stream /snapshot /api/*) — FR-7
//   모든 /api/* 는 X-Device-Key 헤더 필수. CORS는 대시보드 오리진만 허용.
// ============================================================================
#include <Arduino.h>

void webBegin();
void webLoop();          // server.handleClient()
