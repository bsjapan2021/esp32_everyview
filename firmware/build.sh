#!/usr/bin/env bash
# ============================================================================
#  ESP32CAM-Guard 빌드/업로드 스크립트 (arduino-cli)
#  대상: AI-Thinker ESP32-CAM · PSRAM 필수 · 4MB 양면 OTA(partitions_ota.csv)
# ============================================================================
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SKETCH="$HERE/esp32cam_guard"
FQBN="esp32:esp32:esp32cam"   # PSRAM은 이 보드에서 항상 활성(-DBOARD_HAS_PSRAM 내장), 별도 옵션 없음
PORT="${1:-}"          # 예: ./build.sh /dev/cu.usbserial-XXXX   (생략 시 컴파일만)

# 0) 사전: 코어/라이브러리
arduino-cli core list | grep -q "esp32:esp32" || arduino-cli core install esp32:esp32
for lib in "WiFiManager" "ArduinoJson"; do
  arduino-cli lib list | grep -qi "$lib" || arduino-cli lib install "$lib"
done

# 0-1) (권장) 실제 플래시 용량 확인 — 4MB vs 8MB 파티션 선택 (FR-6.3.1/R13)
if [[ -n "$PORT" ]] && command -v esptool.py >/dev/null 2>&1; then
  echo "== flash_id =="; esptool.py --port "$PORT" flash_id || true
fi

# 1) 컴파일 — 스케치 폴더의 partitions.csv(4MB 양면 OTA)를 코어가 자동 사용.
#    upload.maximum_size 는 app0 크기(0x1E0000=1966080)에 맞춰 사이즈 체크 통과.
echo "== compile =="
arduino-cli compile \
  --fqbn "${FQBN}" \
  --build-property upload.maximum_size=1966080 \
  --output-dir "$HERE/build" \
  "$SKETCH"

echo "== 산출물 =="; ls -la "$HERE/build"/*.bin 2>/dev/null || true

# 2) 업로드 (포트 지정 시)
if [[ -n "$PORT" ]]; then
  echo "== upload ($PORT) =="
  arduino-cli upload -p "$PORT" --fqbn "${FQBN}:PSRAM=enabled" "$SKETCH"
  echo "== monitor: arduino-cli monitor -p $PORT -c baudrate=115200 =="
fi
