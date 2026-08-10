#pragma once
// ============================================================================
//  cloud — Vercel /api/ingest 업로드 + 하트비트 + 서명URL 미디어 업로드 (FR-5.4)
//   대용량 원본은 Vercel 함수를 우회해 Supabase Storage 서명 URL로 직접 PUT.
// ============================================================================
#include <Arduino.h>

void   cloudBegin();

// 이벤트 메타 + 소형 썸네일 전송 → events 레코드 생성. 성공 시 event id 반환("" 실패).
String cloudIngestEvent(const String& detectedIso, uint32_t epoch, bool timeSynced,
                        const char* trigger, uint8_t score, uint16_t hitCount,
                        const String& localPath, const uint8_t* thumb, size_t thumbLen);

// 원본 미디어 업로드: 서명URL 발급 → 직접 PUT → 완료 통보. 성공 시 공개/서명 URL 반환.
bool   cloudUploadMedia(const String& eventId, const char* kind /*snapshot|clip*/,
                        const uint8_t* data, size_t len, const char* contentType);

// 1분 주기 상태 보고. 응답의 원격 명령(capture/ota) 처리. (FR-5.4 /api/heartbeat)
void   cloudHeartbeat();
