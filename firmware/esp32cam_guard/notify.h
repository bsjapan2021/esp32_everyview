#pragma once
// ============================================================================
//  notify — 텔레그램 원격 알림 / 명령 폴링 / 자동 페어링 / 재전송 큐 (FR-5)
// ============================================================================
#include <Arduino.h>

void notifyBegin();

// 저수준 전송
bool notifyValidateToken();                                  // getMe (FR-5.0.5)
bool notifySendText(const String& msg);                      // sendMessage
bool notifySendPhoto(const uint8_t* jpg, size_t len, const String& caption,
                     bool withButtons = false);              // sendPhoto (multipart)

// 이벤트 알림: 캡션 구성 + 사진 즉시 전송(≤8초 목표) + 실패 시 큐 (FR-5.1~5.7)
void notifyEvent(const String& caption, const uint8_t* jpg, size_t len);

// 시스템 알림 (부팅/WiFi/SD/정리/OTA/하트비트) — FR-5.8
void notifySystem(const String& msg);

// 명령 폴링(getUpdates): 명령 처리 + 자동 페어링 chat_id 등록 (FR-5.0.3/5.5)
void notifyPoll();

// 음소거 상태 (FR-5.4 /mute)
bool notifyMuted();

// 실패 큐 재전송 시도 (FR-5.7)
void notifyFlushQueue();
