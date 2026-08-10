#pragma once
// ============================================================================
//  camera — OV2640 초기화 / 캡처 / 해상도 전환 / 시각 오버레이 (FR-2)
// ============================================================================
#include <Arduino.h>
#include "esp_camera.h"
#include <time.h>

bool camInit();                                   // PSRAM 감지 → HD, 미검출 시 SVGA 강등
camera_fb_t* camCapture();                        // 현재 해상도 프레임 (반드시 camReturn)
void         camReturn(camera_fb_t* fb);

// 지정 해상도/품질로 JPEG 스냅샷 생성. stamp=true면 시각 오버레이 시도.
//  성공 시 *jpg (ps_malloc/malloc) 반환 — 호출자가 free() 로 해제. 실패 시 false.
//  overlayApplied 로 오버레이 성공 여부를 알린다(실패해도 파일명·메타·캡션에 시각 보장).
bool camSnapshot(framesize_t size, int quality, bool stamp, time_t t,
                 uint8_t** jpg, size_t* len, bool* overlayApplied);

void camFlash(bool on);                           // 플래시 LED 순간 점등 (야간)
void camSetFrameSize(framesize_t size);           // 스트림 해상도 전환
sensor_t* camSensor();
