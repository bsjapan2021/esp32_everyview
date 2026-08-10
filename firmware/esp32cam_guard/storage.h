#pragma once
// ============================================================================
//  storage — SD_MMC(1-bit) 마운트 / 이벤트 저장 / MJPEG-AVI / 순환삭제 (FR-2,3)
// ============================================================================
#include <Arduino.h>
#include <FS.h>
#include <vector>

bool   storageBegin();                 // SD_MMC 1-bit 마운트 + 디렉터리 생성
bool   storageMounted();
void   storageUpdateStats();           // 총/사용/여유 갱신 → g_rt
bool   storageFreeLow();               // 여유 < 15% || < 300MB (FR-3.2)
int    storagePurge();                 // 순환 삭제, 삭제한 폴더 수 반환 (FR-3.3)

// 이벤트 저장 경로 베이스 생성: "/DCIM/2026-08-10/EVT_20260810_143207_001"
//  (날짜 폴더 생성 + 초당 시퀀스 NNN 부여). 반환값에 확장자만 붙여 사용.
String storageEventBase(time_t t);

bool   storageWriteFile(const String& path, const uint8_t* data, size_t len);
void   storageLog(const String& tag, const String& msg);   // /LOG/system_YYYYMMDD.log

// ─── MJPEG-AVI 라이터 (FR-2.3 / D3) ────────────────────────────────────────
class AviWriter {
public:
  bool begin(const String& path, uint16_t w, uint16_t h, uint16_t fps);
  bool addFrame(const uint8_t* jpg, size_t len);
  bool end();
  uint32_t frameCount() const { return frames_; }
private:
  File     f_;
  uint16_t w_ = 0, h_ = 0, fps_ = 10;
  uint32_t frames_ = 0;
  uint32_t moviStart_ = 0;
  uint32_t moviBytes_ = 0;
  std::vector<uint32_t> idxOffset_;   // movi 기준 오프셋
  std::vector<uint32_t> idxSize_;
  void writeU32(uint32_t v);
  void writeU16(uint16_t v);
  void writeTag(const char* t);
};

// ─── 설정 백업/복원 (FR-1.4) ───────────────────────────────────────────────
bool storageBackupConfig();            // NVS → /config.json
bool storageRestoreConfig();           // /config.json → g_cfg (부팅 시 옵션)

// ─── 재전송 큐 (FR-5.7) ────────────────────────────────────────────────────
bool storageQueuePush(const String& json);           // /QUEUE/pending.json 적재
std::vector<String> storageQueuePopAll();             // 전량 로드 후 파일 비움
