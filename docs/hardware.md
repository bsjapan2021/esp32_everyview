# 하드웨어 결선 가이드

## 부품

| 부품 | 사양 | 비고 |
|---|---|---|
| MCU | ESP32-CAM AI-Thinker (PSRAM 필수) | PSRAM 없으면 HD 프레임버퍼 불가 → SVGA 강등 |
| 카메라 | OV2640 (기본 동봉) | 야간은 OV2640+IR 모듈 권장 |
| 저장 | microSD Class10 16~64GB, FAT32 | **SD_MMC 1-bit 고정** (4-bit는 GPIO4 플래시와 충돌) |
| 전원 | 5V / **2A 이상** | 부족 시 brownout 리셋 |
| 모션 보조 | HC-SR501 PIR → GPIO13 (옵션) | 코드에서 `pirEnabled` ON 필요 |
| 프로그래머 | USB-TTL(CH340/CP2102) 또는 ESP32-CAM-MB | 플래시 시 GPIO0-GND |

## 핀 점유표

| 기능 | 핀 |
|---|---|
| 카메라 데이터/제어 | GPIO 0,5,18,19,21,22,23,25,26,27,32,34,35,36,39 |
| SD_MMC 1-bit | GPIO 2(D0), 14(CLK), 15(CMD) |
| 플래시 LED | GPIO 4 |
| 상태 LED | GPIO 33 (LOW=ON) |
| 여분 | GPIO 13(PIR), GPIO 12(부저/입력, 부팅 시 LOW 유지) |

> ⚠️ **GPIO0은 카메라 XCLK와 공유**. 팩토리 리셋(GPIO0→GND)은 **부팅 시점**에만
> 안전하게 검사한다(카메라 초기화 이후 연속 폴링 금지). 펌웨어는 부팅 직후 500ms
> 창에서만 GPIO0 접지를 확인한다.

## 플래시(업로드) 배선

```
USB-TTL        ESP32-CAM
 5V/VCC ─────── 5V
 GND ────────── GND
 TX ─────────── U0R (GPIO3)
 RX ─────────── U0T (GPIO1)
 (플래시 시)     GPIO0 ── GND   ← 업로드 직전 연결, 완료 후 제거하고 리셋
```

- 업로드: `firmware/build.sh /dev/cu.usbserial-XXXX`
- 모니터: `arduino-cli monitor -p /dev/cu.usbserial-XXXX -c baudrate=115200`

## PIR(옵션) 배선

```
HC-SR501   ESP32-CAM
 VCC ─────── 5V
 GND ─────── GND
 OUT ─────── GPIO13
```
포털/대시보드에서 PIR 사용을 켜면 모션과 OR 조건으로 트리거된다.

## 전원 주의 (R1)

카메라 초기화·WiFi 송신 순간 전류가 급증한다. **5V 2A 이상** 어댑터를 쓰고, USB-TTL의
빈약한 5V로 카메라를 상시 구동하지 말 것(brownout 리셋 반복의 주원인).
