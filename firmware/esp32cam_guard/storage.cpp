#include "storage.h"
#include "appstate.h"
#include "timekeeper.h"
#include <SD_MMC.h>
#include <ArduinoJson.h>

static bool s_mounted = false;

// esp32 코어 버전에 따라 File::name()이 전체경로/파일명을 달리 반환 → basename 정규화
static String baseName(const String& p) {
  int slash = p.lastIndexOf('/');
  return slash >= 0 ? p.substring(slash + 1) : p;
}

// ─── 마운트 & 디렉터리 ─────────────────────────────────────────────────────
static void ensureDir(const char* d) { if (!SD_MMC.exists(d)) SD_MMC.mkdir(d); }

bool storageBegin() {
  // 1-bit 모드 고정 (4-bit는 GPIO4 플래시와 충돌) — HW 요구
  if (!SD_MMC.begin("/sdcard", SD_ONE_BIT_MODE)) {
    Serial.println(F("[sd] 마운트 실패 — 메모리 전송 전용 모드로 계속 (FR-3.6)"));
    s_mounted = false; g_rt.sdMounted = false;
    return false;
  }
  uint8_t type = SD_MMC.cardType();
  if (type == CARD_NONE) {
    Serial.println(F("[sd] 카드 없음"));
    s_mounted = false; g_rt.sdMounted = false;
    return false;
  }
  s_mounted = true; g_rt.sdMounted = true;
  ensureDir(DIR_DCIM); ensureDir(DIR_LOG); ensureDir(DIR_QUEUE); ensureDir(DIR_REC);
  storageUpdateStats();
  Serial.printf("[sd] 마운트 OK — 사용 %llu / 총 %llu bytes (%u%%)\n",
                g_rt.sdUsedBytes, g_rt.sdTotalBytes, g_rt.sdUsedPct);
  return true;
}

bool storageMounted() { return s_mounted; }

void storageUpdateStats() {
  if (!s_mounted) return;
  g_rt.sdTotalBytes = SD_MMC.totalBytes();
  g_rt.sdUsedBytes  = SD_MMC.usedBytes();
  g_rt.sdUsedPct    = g_rt.sdTotalBytes ? (uint8_t)(g_rt.sdUsedBytes * 100 / g_rt.sdTotalBytes) : 0;
}

bool storageFreeLow() {
  if (!s_mounted) return false;
  storageUpdateStats();
  uint64_t freeB = g_rt.sdTotalBytes - g_rt.sdUsedBytes;
  uint8_t  freePct = 100 - g_rt.sdUsedPct;
  return (freePct < STORAGE_MIN_FREE_PCT) || (freeB < (uint64_t)STORAGE_MIN_FREE_MB * 1024 * 1024);
}

// 재귀 삭제
static void rmRecursive(const String& path) {
  File dir = SD_MMC.open(path);
  if (!dir) return;
  if (!dir.isDirectory()) { dir.close(); SD_MMC.remove(path); return; }
  File e;
  while ((e = dir.openNextFile())) {
    String p = String(e.path());
    bool isDir = e.isDirectory();
    e.close();
    if (isDir) rmRecursive(p); else SD_MMC.remove(p);
  }
  dir.close();
  SD_MMC.rmdir(path);
}

// 순환 삭제: /DCIM 하위 가장 오래된 날짜 폴더부터. 여유 25% 회복까지. (FR-3.3)
int storagePurge() {
  if (!s_mounted) return 0;
  int removed = 0;
  while (true) {
    storageUpdateStats();
    uint8_t freePct = 100 - g_rt.sdUsedPct;
    if (freePct >= STORAGE_RECOVER_PCT) break;

    // 가장 오래된(사전순 최소) 날짜 폴더 탐색
    File root = SD_MMC.open(DIR_DCIM);
    if (!root) break;
    String oldest = "";
    File e;
    while ((e = root.openNextFile())) {
      if (e.isDirectory()) {
        String name = baseName(String(e.name()));   // "2026-08-10"
        if (oldest == "" || name < oldest) oldest = name;
      }
      e.close();
    }
    root.close();
    if (oldest == "") break;                 // 지울 폴더 없음

    String full = String(DIR_DCIM) + "/" + oldest;
    Serial.printf("[sd] 순환삭제: %s\n", full.c_str());
    // 보호 파일 존중(FR-3.5): 폴더 내 .json protected 확인 생략 시 단순 삭제.
    rmRecursive(full);
    removed++;
    // purge 로그 (FR-3.4)
    File pl = SD_MMC.open("/LOG/purge.log", FILE_APPEND);
    if (pl) { pl.printf("%s deleted %s\n", tkStampHuman().c_str(), full.c_str()); pl.close(); }
    if (removed > 60) break;                  // 안전 상한
  }
  storageUpdateStats();
  return removed;
}

// ─── 이벤트 경로 ───────────────────────────────────────────────────────────
String storageEventBase(time_t t) {
  String date = tkDateFolder(t);
  String stamp = tkStampFile(t);              // 20260810_143207
  String dir = String(DIR_DCIM) + "/" + date;
  if (s_mounted && !SD_MMC.exists(dir)) SD_MMC.mkdir(dir);

  // 초당 시퀀스 NNN
  int seq = 1;
  if (s_mounted) {
    File d = SD_MMC.open(dir);
    if (d) {
      File e;
      String prefix = "EVT_" + stamp + "_";
      while ((e = d.openNextFile())) {
        String n = String(e.name());
        int p = n.indexOf(prefix);
        if (p >= 0) {
          int s = n.substring(p + prefix.length(), p + prefix.length() + 3).toInt();
          if (s >= seq) seq = s + 1;
        }
        e.close();
      }
      d.close();
    }
  }
  char nnn[4]; snprintf(nnn, sizeof(nnn), "%03d", seq);
  return dir + "/EVT_" + stamp + "_" + nnn;    // 확장자 없음
}

bool storageWriteFile(const String& path, const uint8_t* data, size_t len) {
  if (!s_mounted) return false;
  File f = SD_MMC.open(path, FILE_WRITE);
  if (!f) return false;
  size_t w = f.write(data, len);
  f.close();
  return w == len;
}

void storageLog(const String& tag, const String& msg) {
  Serial.printf("[%s] %s\n", tag.c_str(), msg.c_str());
  if (!s_mounted) return;
  String path = String(DIR_LOG) + "/system_" + tkDateFolder() ; path.replace("-", ""); path += ".log";
  File f = SD_MMC.open(path, FILE_APPEND);
  if (f) { f.printf("%s [%s] %s\n", tkStampHuman().c_str(), tag.c_str(), msg.c_str()); f.close(); }
}

// ─── AVI(MJPG) 라이터 ──────────────────────────────────────────────────────
void AviWriter::writeU32(uint32_t v) { f_.write((uint8_t*)&v, 4); }
void AviWriter::writeU16(uint16_t v) { f_.write((uint8_t*)&v, 2); }
void AviWriter::writeTag(const char* t) { f_.write((const uint8_t*)t, 4); }

bool AviWriter::begin(const String& path, uint16_t w, uint16_t h, uint16_t fps) {
  if (!s_mounted) return false;
  f_ = SD_MMC.open(path, FILE_WRITE);
  if (!f_) return false;
  w_ = w; h_ = h; fps_ = fps ? fps : 10; frames_ = 0; moviBytes_ = 0;
  idxOffset_.clear(); idxSize_.clear();

  // 헤더 자리(뒤에서 크기 backfill). RIFF
  writeTag("RIFF"); writeU32(0); writeTag("AVI ");
  // LIST hdrl
  writeTag("LIST"); writeU32(4 + 8 + 56 + 8 + 4 + 8 + 56 + 8 + 40); writeTag("hdrl");
  //   avih
  writeTag("avih"); writeU32(56);
  writeU32(1000000 / fps_);      // dwMicroSecPerFrame
  writeU32(0);                   // dwMaxBytesPerSec (backfill 생략)
  writeU32(0);                   // dwPaddingGranularity
  writeU32(0x10);                // dwFlags (HASINDEX)
  writeU32(0);                   // dwTotalFrames (backfill)
  writeU32(0);                   // dwInitialFrames
  writeU32(1);                   // dwStreams
  writeU32(0);                   // dwSuggestedBufferSize
  writeU32(w_); writeU32(h_);    // dwWidth, dwHeight
  writeU32(0); writeU32(0); writeU32(0); writeU32(0); // dwReserved[4]
  //   LIST strl
  writeTag("LIST"); writeU32(4 + 8 + 56 + 8 + 40); writeTag("strl");
  //     strh
  writeTag("strh"); writeU32(56);
  writeTag("vids"); writeTag("MJPG");
  writeU32(0); writeU16(0); writeU16(0);   // dwFlags, wPriority, wLanguage
  writeU32(0);                             // dwInitialFrames
  writeU32(1);                             // dwScale
  writeU32(fps_);                          // dwRate → fps
  writeU32(0);                             // dwStart
  writeU32(0);                             // dwLength (backfill)
  writeU32(0);                             // dwSuggestedBufferSize
  writeU32(0xFFFFFFFF);                    // dwQuality
  writeU32(0);                             // dwSampleSize
  writeU16(0); writeU16(0); writeU16(w_); writeU16(h_); // rcFrame
  //     strf (BITMAPINFOHEADER)
  writeTag("strf"); writeU32(40);
  writeU32(40);                            // biSize
  writeU32(w_); writeU32(h_);              // biWidth, biHeight
  writeU16(1); writeU16(24);               // biPlanes, biBitCount
  writeTag("MJPG");                        // biCompression
  writeU32((uint32_t)w_ * h_ * 3);         // biSizeImage
  writeU32(0); writeU32(0); writeU32(0); writeU32(0); // ppm, clr...
  // LIST movi
  writeTag("LIST"); moviStart_ = f_.position(); writeU32(0); writeTag("movi");
  return true;
}

bool AviWriter::addFrame(const uint8_t* jpg, size_t len) {
  if (!f_) return false;
  uint32_t off = f_.position() - (moviStart_ + 4); // movi 데이터 기준 오프셋(‘movi’ 다음)
  writeTag("00dc"); writeU32(len);
  f_.write(jpg, len);
  if (len & 1) f_.write((uint8_t)0);               // 워드 정렬 패딩
  idxOffset_.push_back(off);
  idxSize_.push_back(len);
  frames_++;
  moviBytes_ += 8 + len + (len & 1);
  return true;
}

bool AviWriter::end() {
  if (!f_) return false;
  // idx1
  writeTag("idx1"); writeU32(frames_ * 16);
  for (uint32_t i = 0; i < frames_; i++) {
    writeTag("00dc");
    writeU32(0x10);                 // AVIIF_KEYFRAME
    writeU32(idxOffset_[i]);
    writeU32(idxSize_[i]);
  }
  uint32_t fileEnd = f_.position();

  // backfill: RIFF size
  f_.seek(4);  writeU32(fileEnd - 8);
  // avih dwTotalFrames (offset: RIFF(12) + LIST hdrl header(8) + 'hdrl'(4) + 'avih'(8) + 4*4)
  //  RIFF header=12, then LIST(8)+hdrl(4)=12 → 24, +avih(8)=32, dwTotalFrames는 avih 내 5번째 U32
  f_.seek(12 + 8 + 4 + 8 + 16); writeU32(frames_);  // 32 + 16 = dwTotalFrames 위치
  // strh dwLength
  //  … hdrl(avih 56+8) 이후 LIST strl … 계산이 번거로워 movi/idx 재계산으로 대체
  // movi LIST size
  f_.seek(moviStart_); writeU32(4 + moviBytes_);
  f_.flush();
  f_.close();
  return true;
}

// ─── 설정 백업/복원 ────────────────────────────────────────────────────────
bool storageBackupConfig() {
  if (!s_mounted) return false;
  StaticJsonDocument<1024> d;
  d["deviceName"] = g_cfg.deviceName;
  d["location"]   = g_cfg.location;
  d["tgChatId"]   = g_cfg.tgChatId;
  d["tgUsername"] = g_cfg.tgUsername;
  d["cloudUrl"]   = g_cfg.cloudUrl;
  d["motionSens"] = g_cfg.motionSens;
  d["cooldownSec"]= g_cfg.cooldownSec;
  d["clipSec"]    = g_cfg.clipSec;
  d["tzOffsetMin"]= g_cfg.tzOffsetMin;
  d["pirEnabled"] = g_cfg.pirEnabled;
  // 토큰은 백업하지 않음(보안). NVS 가 정본.
  File f = SD_MMC.open(PATH_CONFIG_BACKUP, FILE_WRITE);
  if (!f) return false;
  serializeJsonPretty(d, f);
  f.close();
  return true;
}

bool storageRestoreConfig() {
  if (!s_mounted || !SD_MMC.exists(PATH_CONFIG_BACKUP)) return false;
  File f = SD_MMC.open(PATH_CONFIG_BACKUP, FILE_READ);
  if (!f) return false;
  StaticJsonDocument<1024> d;
  if (deserializeJson(d, f)) { f.close(); return false; }
  f.close();
  if (d["deviceName"].is<const char*>()) strlcpy(g_cfg.deviceName, d["deviceName"], sizeof(g_cfg.deviceName));
  if (d["location"].is<const char*>())   strlcpy(g_cfg.location,   d["location"],   sizeof(g_cfg.location));
  if (d["cloudUrl"].is<const char*>())   strlcpy(g_cfg.cloudUrl,   d["cloudUrl"],   sizeof(g_cfg.cloudUrl));
  if (d["motionSens"].is<int>())  g_cfg.motionSens  = d["motionSens"];
  if (d["cooldownSec"].is<int>()) g_cfg.cooldownSec = d["cooldownSec"];
  if (d["clipSec"].is<int>())     g_cfg.clipSec     = d["clipSec"];
  if (d["tzOffsetMin"].is<int>()) g_cfg.tzOffsetMin = d["tzOffsetMin"];
  if (d["pirEnabled"].is<bool>()) g_cfg.pirEnabled  = d["pirEnabled"];
  return true;
}

// ─── 재전송 큐 ─────────────────────────────────────────────────────────────
bool storageQueuePush(const String& json) {
  if (!s_mounted) return false;
  File f = SD_MMC.open("/QUEUE/pending.json", FILE_APPEND);
  if (!f) return false;
  f.println(json);
  f.close();
  return true;
}

std::vector<String> storageQueuePopAll() {
  std::vector<String> out;
  if (!s_mounted || !SD_MMC.exists("/QUEUE/pending.json")) return out;
  File f = SD_MMC.open("/QUEUE/pending.json", FILE_READ);
  if (!f) return out;
  while (f.available() && out.size() < 50) {
    String line = f.readStringUntil('\n');
    line.trim();
    if (line.length()) out.push_back(line);
  }
  f.close();
  SD_MMC.remove("/QUEUE/pending.json");
  return out;
}
