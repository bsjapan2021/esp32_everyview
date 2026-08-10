#pragma once
// ============================================================================
//  portal — WiFiManager 캡티브 포털 + 커스텀 설정 + NVS (FR-1)
//
//  「esp-wifi-portal 스킬」의 표준 구현/원칙을 우선 적용(FR-1.2.1):
//    · 최초 설정 포털은 타임아웃 0(무제한) → 폰 목록에서 AP가 사라지지 않음
//    · WiFi 자격을 코드에 하드코딩하지 않음(프로비저닝은 포털에 일임)
//    · 재설정: 부팅 시 버튼/시리얼 'w'/'W'
//  스킬이 다루지 않는 영역(텔레그램·device_key 등)은 커스텀 파라미터로 확장.
//  → 스킬 SKILL.md 입수 시 이 모듈만 교체 가능(모듈 분리 설계, R11).
// ============================================================================
#include <Arduino.h>

void portalLoadConfig();       // NVS → g_cfg
void portalSaveConfig();       // g_cfg → NVS
void portalBegin();            // 팩토리리셋 체크 → 설정 로드 → 연결/포털
void portalLoop();             // 비차단 재연결 + AP LED
bool portalConnected();
void portalForce();            // 온디맨드 설정 포털 (FR-1.6)
void portalFactoryReset();     // NVS + WiFi 초기화 후 재부팅 (FR-1.5)
void portalHandleSerial();     // 시리얼 'w'/'W' 명령
