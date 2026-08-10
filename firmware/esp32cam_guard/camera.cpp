#include "camera.h"
#include "appstate.h"
#include "timekeeper.h"
#include "img_converters.h"

// ─── 5x7 비트맵 폰트 (오버레이 최소 문자셋: 0-9 : - 공백 K S T) ──────────────
//  각 글리프 7행, 행당 하위 5비트(bit4..bit0 = 좌..우).
static const uint8_t FONT5x7[][7] = {
  {0x0E,0x11,0x13,0x15,0x19,0x11,0x0E}, // 0
  {0x04,0x0C,0x04,0x04,0x04,0x04,0x0E}, // 1
  {0x0E,0x11,0x01,0x02,0x04,0x08,0x1F}, // 2
  {0x1E,0x01,0x01,0x0E,0x01,0x01,0x1E}, // 3
  {0x02,0x06,0x0A,0x12,0x1F,0x02,0x02}, // 4
  {0x1F,0x10,0x1E,0x01,0x01,0x11,0x0E}, // 5
  {0x06,0x08,0x10,0x1E,0x11,0x11,0x0E}, // 6
  {0x1F,0x01,0x02,0x04,0x08,0x08,0x08}, // 7
  {0x0E,0x11,0x11,0x0E,0x11,0x11,0x0E}, // 8
  {0x0E,0x11,0x11,0x0F,0x01,0x02,0x0C}, // 9
  {0x00,0x04,0x04,0x00,0x04,0x04,0x00}, // :  (10)
  {0x00,0x00,0x00,0x1F,0x00,0x00,0x00}, // -  (11)
  {0x00,0x00,0x00,0x00,0x00,0x00,0x00}, // ' '(12)
  {0x11,0x12,0x14,0x18,0x14,0x12,0x11}, // K  (13)
  {0x0F,0x10,0x10,0x0E,0x01,0x01,0x1E}, // S  (14)
  {0x1F,0x04,0x04,0x04,0x04,0x04,0x04}, // T  (15)
};
static int glyphIndex(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  switch (c) { case ':': return 10; case '-': return 11; case ' ': return 12;
               case 'K': return 13; case 'S': return 14; case 'T': return 15; }
  return 12; // 미지원 문자는 공백
}

static inline void px565(uint8_t* buf, int w, int h, int x, int y, uint16_t color) {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  size_t o = (size_t)(y * w + x) * 2;
  buf[o]   = color >> 8;
  buf[o+1] = color & 0xFF;
}

// RGB565 버퍼에 문자열을 그린다(어두운 반투명 배경 + 흰 글자). scale 배율.
static void drawText565(uint8_t* buf, int w, int h, int x0, int y0,
                        const char* text, int scale) {
  int len = strlen(text);
  int textW = len * (5 + 1) * scale;
  int textH = 7 * scale;
  // 가독성 배경(진한 회색) 박스
  for (int yy = y0 - scale; yy < y0 + textH + scale; yy++)
    for (int xx = x0 - scale; xx < x0 + textW + scale; xx++)
      px565(buf, w, h, xx, yy, 0x2104); // 어두운 회색

  int cx = x0;
  for (int i = 0; i < len; i++) {
    const uint8_t* g = FONT5x7[glyphIndex(text[i])];
    for (int row = 0; row < 7; row++) {
      for (int col = 0; col < 5; col++) {
        if (g[row] & (1 << (4 - col))) {
          for (int sy = 0; sy < scale; sy++)
            for (int sx = 0; sx < scale; sx++)
              px565(buf, w, h, cx + col * scale + sx, y0 + row * scale + sy, 0xFFFF);
        }
      }
    }
    cx += (5 + 1) * scale;
  }
}

// ─── 카메라 초기화 ─────────────────────────────────────────────────────────
bool camInit() {
  camera_config_t c = {};
  c.ledc_channel = LEDC_CHANNEL_0;
  c.ledc_timer   = LEDC_TIMER_0;
  c.pin_d0 = CAM_PIN_Y2;  c.pin_d1 = CAM_PIN_Y3;  c.pin_d2 = CAM_PIN_Y4;  c.pin_d3 = CAM_PIN_Y5;
  c.pin_d4 = CAM_PIN_Y6;  c.pin_d5 = CAM_PIN_Y7;  c.pin_d6 = CAM_PIN_Y8;  c.pin_d7 = CAM_PIN_Y9;
  c.pin_xclk = CAM_PIN_XCLK;  c.pin_pclk = CAM_PIN_PCLK;
  c.pin_vsync = CAM_PIN_VSYNC; c.pin_href = CAM_PIN_HREF;
  c.pin_sccb_sda = CAM_PIN_SIOD; c.pin_sccb_scl = CAM_PIN_SIOC;
  c.pin_pwdn = CAM_PIN_PWDN;  c.pin_reset = CAM_PIN_RESET;
  c.xclk_freq_hz = XCLK_FREQ_HZ;
  c.pixel_format = PIXFORMAT_JPEG;
  c.grab_mode    = CAMERA_GRAB_LATEST;

  g_rt.psramFound = psramFound();
  if (g_rt.psramFound) {
    c.frame_size   = FRAMESIZE_HD;   // 1280x720 (FR-2.1)
    c.jpeg_quality = 10;
    c.fb_count     = 2;
    c.fb_location  = CAMERA_FB_IN_PSRAM;
  } else {
    Serial.println(F("[cam] ⚠ PSRAM 미검출 → SVGA/quality12 강등 (FR-2.1)"));
    c.frame_size   = FRAMESIZE_SVGA;
    c.jpeg_quality = 12;
    c.fb_count     = 1;
    c.fb_location  = CAMERA_FB_IN_DRAM;
  }

  esp_err_t err = esp_camera_init(&c);
  if (err != ESP_OK) {
    Serial.printf("[cam] 초기화 실패 0x%x\n", err);
    g_rt.cameraReady = false;
    return false;
  }
  sensor_t* s = esp_camera_sensor_get();
  if (s) {
    s->set_vflip(s, 0);
    s->set_hmirror(s, 0);
    s->set_brightness(s, 1);
    s->set_saturation(s, 0);
  }
  g_rt.cameraReady = true;
  Serial.println(F("[cam] 초기화 완료"));
  return true;
}

camera_fb_t* camCapture()          { return esp_camera_fb_get(); }
void         camReturn(camera_fb_t* fb) { if (fb) esp_camera_fb_return(fb); }
sensor_t*    camSensor()           { return esp_camera_sensor_get(); }

void camSetFrameSize(framesize_t size) {
  sensor_t* s = esp_camera_sensor_get();
  if (s) s->set_framesize(s, size);
}

void camFlash(bool on) {
  pinMode(PIN_LED_FLASH, OUTPUT);
  digitalWrite(PIN_LED_FLASH, on ? HIGH : LOW);
}

// JPEG 에 시각 오버레이 시도: decode→draw→re-encode. 실패 시 false(원본 유지).
static bool stampJpeg(const uint8_t* inJpg, size_t inLen, uint16_t w, uint16_t h,
                      time_t t, uint8_t** outJpg, size_t* outLen) {
  size_t rgbLen = (size_t)w * h * 2;
  uint8_t* rgb = (uint8_t*)ps_malloc(rgbLen);
  if (!rgb) return false;                              // PSRAM 부족 → 폴백
  if (!jpg2rgb565(inJpg, inLen, rgb, JPG_SCALE_NONE)) { free(rgb); return false; }

  String stamp = tkStampHuman(t) + " KST";
  if (!g_rt.timeSynced) stamp = String("TIME_UNSYNCED ") + tkStampHuman(t);
  int scale = (w >= 1200) ? 3 : 2;
  drawText565(rgb, w, h, 8, 8, stamp.c_str(), scale);

  bool ok = fmt2jpg(rgb, rgbLen, w, h, PIXFORMAT_RGB565,
                    (g_cfg.motionSens > 0 ? 12 : 12), outJpg, outLen);
  free(rgb);
  return ok;
}

bool camSnapshot(framesize_t size, int quality, bool stamp, time_t t,
                 uint8_t** jpg, size_t* len, bool* overlayApplied) {
  if (overlayApplied) *overlayApplied = false;
  sensor_t* s = esp_camera_sensor_get();
  if (!s) return false;

  framesize_t prev = (framesize_t)s->status.framesize;
  int prevQ = s->status.quality;
  if (size != prev) { s->set_framesize(s, size); }
  if (quality != prevQ) { s->set_quality(s, quality); }

  // 해상도/품질 변경 후 안정화: 2프레임 폐기
  for (int i = 0; i < 2; i++) { camera_fb_t* d = esp_camera_fb_get(); camReturn(d); }

  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) { if (size != prev) s->set_framesize(s, prev); return false; }

  bool result = false;
  if (stamp) {
    uint8_t* out = nullptr; size_t outLen = 0;
    if (stampJpeg(fb->buf, fb->len, fb->width, fb->height, t, &out, &outLen)) {
      *jpg = out; *len = outLen; result = true;
      if (overlayApplied) *overlayApplied = true;
    }
  }
  if (!result) {
    // 오버레이 미적용(또는 비요청) → 원본 JPEG 복사 (시각은 파일명·메타·캡션이 보장)
    uint8_t* copy = (uint8_t*)ps_malloc(fb->len);
    if (!copy) copy = (uint8_t*)malloc(fb->len);
    if (copy) { memcpy(copy, fb->buf, fb->len); *jpg = copy; *len = fb->len; result = true; }
  }

  camReturn(fb);
  if (size != prev)    s->set_framesize(s, prev);
  if (quality != prevQ) s->set_quality(s, prevQ);
  return result;
}
