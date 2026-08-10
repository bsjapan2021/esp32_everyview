#include "localweb.h"
#include "appstate.h"
#include "camera.h"
#include "timekeeper.h"
#include "motion.h"
#include "storage.h"
#include <WiFi.h>
#include <WebServer.h>
#include <SD_MMC.h>
#include <ArduinoJson.h>

extern void otaCheckAndApply(bool force);
extern void portalForce();
extern void portalSaveConfig();

static WebServer server(80);
static bool s_streaming = false;

// ─── CORS / 인증 ───────────────────────────────────────────────────────────
static String corsOrigin() {
  String u = g_cfg.cloudUrl; int p = u.indexOf("/api/");
  return p > 0 ? u.substring(0, p) : String("*");
}
static void addCors() {
  server.sendHeader("Access-Control-Allow-Origin", corsOrigin());
  server.sendHeader("Access-Control-Allow-Headers", "X-Device-Key, Content-Type");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}
static bool requireKey() {
  if (!server.hasHeader("X-Device-Key") || server.header("X-Device-Key") != String(g_cfg.deviceKey)) {
    addCors(); server.send(401, "application/json", "{\"error\":\"unauthorized\"}");
    return false;
  }
  return true;
}

// ─── / (로컬 UI) ───────────────────────────────────────────────────────────
static void handleRoot() {
  String html = F("<!doctype html><html lang=ko><meta charset=utf-8>"
    "<meta name=viewport content='width=device-width,initial-scale=1'>"
    "<title>ESP32CAM-Guard</title><style>body{font-family:sans-serif;background:#111;color:#eee;margin:0;padding:12px}"
    "img{width:100%;max-width:640px;border-radius:8px}h1{font-size:18px}.s{font-size:13px;color:#9ab}</style>"
    "<h1>📷 ESP32CAM-Guard</h1><img src='/stream' alt='live'><p class=s id=st>불러오는 중...</p>"
    "<script>fetch('/api/status',{headers:{'X-Device-Key':'"); html += g_cfg.deviceKey;
  html += F("'}}).then(r=>r.json()).then(d=>{document.getElementById('st').textContent="
    "d.name+' v'+d.fw+' · RSSI '+d.rssi+'dBm · SD '+d.sd_used_pct+'% · '+(d.time_synced?'시각동기OK':'미동기')})</script></html>");
  addCors(); server.send(200, "text/html; charset=utf-8", html);
}

// ─── /stream (MJPEG, 동시 1세션) — FR-7 / FR-8.4 ───────────────────────────
static void handleStream() {
  if (s_streaming) { server.send(429, "text/plain", "stream busy"); return; }
  if (!g_rt.cameraReady) { server.send(503, "text/plain", "camera not ready"); return; }
  s_streaming = true;
  WiFiClient client = server.client();
  client.print(F("HTTP/1.1 200 OK\r\n"
                 "Content-Type: multipart/x-mixed-replace; boundary=frame\r\n"
                 "Cache-Control: no-cache\r\nConnection: close\r\n\r\n"));
  while (client.connected()) {
    if (ESP.getFreeHeap() < HEAP_MIN_STREAM_BYTES) break;   // 힙 임계 시 종료 (FR-8.4)
    camera_fb_t* fb = camCapture();
    if (!fb) break;
    client.printf("--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n", fb->len);
    client.write(fb->buf, fb->len);
    client.print("\r\n");
    camReturn(fb);
    delay(40);   // ~25fps 상한
  }
  client.stop();
  s_streaming = false;
}

// ─── /snapshot?size=uxga|hd|svga ───────────────────────────────────────────
static void handleSnapshot() {
  framesize_t sz = FRAMESIZE_HD;
  String s = server.arg("size");
  if (s == "uxga") sz = FRAMESIZE_UXGA;
  else if (s == "svga") sz = FRAMESIZE_SVGA;
  uint8_t* jpg = nullptr; size_t len = 0; bool ov = false;
  if (!camSnapshot(sz, 10, false, tkNow(), &jpg, &len, &ov)) {
    server.send(500, "text/plain", "capture failed"); return;
  }
  addCors();
  server.setContentLength(len);
  server.send(200, "image/jpeg", "");
  server.client().write(jpg, len);
  free(jpg);
}

// ─── /api/status ───────────────────────────────────────────────────────────
static void handleStatus() {
  if (!requireKey()) return;
  storageUpdateStats();
  DynamicJsonDocument d(768);
  d["name"]         = g_cfg.deviceName;
  d["fw"]           = FW_VERSION;
  d["build"]        = FW_BUILD;
  d["uptime_s"]     = millis() / 1000;
  d["rssi"]         = g_rt.rssi;
  d["ip"]           = g_rt.ipAddr;
  d["sd_mounted"]   = g_rt.sdMounted;
  d["sd_used_pct"]  = g_rt.sdUsedPct;
  d["time_synced"]  = g_rt.timeSynced;
  d["event_count"]  = g_rt.eventCount;
  d["flash_kb"]     = g_rt.flashKB;
  d["part_scheme"]  = g_rt.partScheme;
  d["psram"]        = g_rt.psramFound;
  d["tg_token"]     = maskSecret(g_cfg.tgToken);   // 마스킹 (FR-5.0.5)
  d["muted"]        = (g_rt.muteUntilEpoch > tkEpoch());
  String out; serializeJson(d, out);
  addCors(); server.send(200, "application/json", out);
}

// ─── /api/events?limit=N (최신 날짜 폴더의 메타 목록) ──────────────────────
static void handleEvents() {
  if (!requireKey()) return;
  int limit = server.hasArg("limit") ? server.arg("limit").toInt() : 50;
  DynamicJsonDocument d(8192);
  JsonArray arr = d.to<JsonArray>();
  if (g_rt.sdMounted) {
    // 최신 날짜 폴더 탐색
    File root = SD_MMC.open(DIR_DCIM);
    String latest = "";
    if (root) { File e; while ((e = root.openNextFile())) {
        if (e.isDirectory()) { String n(e.name()); int s=n.lastIndexOf('/'); n=s>=0?n.substring(s+1):n;
          if (n > latest) latest = n; } e.close(); } root.close(); }
    if (latest.length()) {
      File dir = SD_MMC.open(String(DIR_DCIM) + "/" + latest);
      if (dir) { File e; int cnt = 0;
        while ((e = dir.openNextFile()) && cnt < limit) {
          String n(e.name());
          if (n.endsWith(".json")) {
            DynamicJsonDocument m(512);
            if (!deserializeJson(m, e)) { arr.add(m); cnt++; }
          }
          e.close();
        }
        dir.close();
      }
    }
  }
  String out; serializeJson(arr, out);
  addCors(); server.send(200, "application/json", out);
}

// ─── /api/file?path= ───────────────────────────────────────────────────────
static void handleFile() {
  if (!requireKey()) return;
  String path = server.arg("path");
  if (!path.startsWith("/") || path.indexOf("..") >= 0 || !SD_MMC.exists(path)) {
    server.send(404, "text/plain", "not found"); return;
  }
  File f = SD_MMC.open(path, FILE_READ);
  if (!f) { server.send(500, "text/plain", "open failed"); return; }
  String ct = path.endsWith(".jpg") ? "image/jpeg" : path.endsWith(".avi") ? "video/x-msvideo"
            : path.endsWith(".json") ? "application/json" : "application/octet-stream";
  addCors();
  server.streamFile(f, ct);
  f.close();
}

// ─── /api/config (POST JSON) ───────────────────────────────────────────────
static void handleConfig() {
  if (!requireKey()) return;
  DynamicJsonDocument d(2048);
  if (deserializeJson(d, server.arg("plain"))) { server.send(400, "application/json", "{\"error\":\"bad json\"}"); return; }
  if (d.containsKey("deviceName")) strlcpy(g_cfg.deviceName, d["deviceName"], sizeof(g_cfg.deviceName));
  if (d.containsKey("location"))   strlcpy(g_cfg.location,   d["location"],   sizeof(g_cfg.location));
  if (d.containsKey("motionSens")) g_cfg.motionSens  = constrain((int)d["motionSens"], 1, 10);
  if (d.containsKey("cooldownSec"))g_cfg.cooldownSec = constrain((int)d["cooldownSec"], 5, 300);
  if (d.containsKey("clipSec"))    g_cfg.clipSec     = constrain((int)d["clipSec"], 1, MAX_CLIP_SEC);
  if (d.containsKey("tzOffsetMin"))g_cfg.tzOffsetMin = d["tzOffsetMin"];
  if (d.containsKey("pirEnabled")) g_cfg.pirEnabled  = d["pirEnabled"];
  if (d.containsKey("clipEnabled"))g_cfg.clipEnabled = d["clipEnabled"];
  if (d.containsKey("scheduleEnabled")) g_cfg.scheduleEnabled = d["scheduleEnabled"];
  if (d.containsKey("maskZone") && d["maskZone"].is<JsonArray>()) {
    JsonArray mz = d["maskZone"]; for (int i = 0; i < 6 && i < (int)mz.size(); i++) g_cfg.maskZone[i] = mz[i];
  }
  portalSaveConfig();
  addCors(); server.send(200, "application/json", "{\"ok\":true}");
}

// ─── 액션 라우트 ───────────────────────────────────────────────────────────
static void handleCapture() { if (!requireKey()) return; motionForce(TRIG_MANUAL); addCors(); server.send(200, "application/json", "{\"ok\":true}"); }
static void handleReboot()  { if (!requireKey()) return; addCors(); server.send(200, "application/json", "{\"ok\":true}"); delay(300); ESP.restart(); }
static void handlePortal()  { if (!requireKey()) return; addCors(); server.send(200, "application/json", "{\"ok\":true}"); portalForce(); }
static void handlePurge()   { if (!requireKey()) return; int n = storagePurge(); addCors(); server.send(200, "application/json", String("{\"removed\":") + n + "}"); }
static void handleOtaCheck(){ if (!requireKey()) return; addCors(); server.send(200, "application/json", "{\"ok\":true}"); otaCheckAndApply(false); }
static void handleOtaApply(){ if (!requireKey()) return; addCors(); server.send(200, "application/json", "{\"ok\":true}"); otaCheckAndApply(true); }

static void handleOptions() { addCors(); server.send(204); }
static void handleNotFound(){ addCors(); server.send(404, "application/json", "{\"error\":\"not found\"}"); }

void webBegin() {
  const char* headerKeys[] = {"X-Device-Key"};
  server.collectHeaders(headerKeys, 1);
  server.on("/", handleRoot);
  server.on("/stream", handleStream);
  server.on("/snapshot", handleSnapshot);
  server.on("/api/status", handleStatus);
  server.on("/api/events", handleEvents);
  server.on("/api/file", handleFile);
  server.on("/api/config", HTTP_POST, handleConfig);
  server.on("/api/capture", HTTP_POST, handleCapture);
  server.on("/api/reboot", HTTP_POST, handleReboot);
  server.on("/api/portal", HTTP_POST, handlePortal);
  server.on("/api/purge", HTTP_POST, handlePurge);
  server.on("/api/ota/check", HTTP_POST, handleOtaCheck);
  server.on("/api/ota/apply", HTTP_POST, handleOtaApply);
  server.onNotFound([]() {
    if (server.method() == HTTP_OPTIONS) handleOptions(); else handleNotFound();
  });
  server.begin();
  Serial.printf("[web] HTTP :80 시작 — http://%s/\n", g_rt.ipAddr);
}

void webLoop() { server.handleClient(); }
