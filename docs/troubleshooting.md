# 트러블슈팅 & 구현 노트

## 알려진 설계 결정 / 단순화 (투명 공개)

PRD를 따르되, 하드웨어 검증 없이 안전하게 컴파일·동작하도록 내린 결정들. 각 항목은
모듈 분리 설계라 후속 개선 시 해당 모듈만 교체하면 된다.

| # | 항목 | 현재 구현 | 근거 / 로드맵 |
|---|---|---|---|
| 1 | **태스크 모델** (FR-8.5) | 협조적 **슈퍼루프** (카메라 접근 직렬화) | esp32-camera 프레임버퍼 동시접근 경합 위험. 감지 응답성은 쿨다운+유계 네트워크로 확보. 듀얼 태스크+뮤텍스는 HW 검증 후 도입 |
| 2 | **클립 프리롤 2초** (FR-2.3) | 전방 `clip_sec`초 녹화 (프리롤 미포함) | RAM 링버퍼 상시 유지가 메모리 부담. **감지시각·스냅샷은 프리롤과 무관하게 보장**. 프리롤은 링버퍼 도입 시 추가 |
| 3 | **TLS 검증** (FR-5.9) | 기본 `setInsecure()` | 검증된 루트 CA를 무테스트로 내장 시 CA 오류로 알림 전면중단(R15) 위험. `certs.h`에 CA 넣고 `USE_TG_CA` 정의 시 핀닝. 포털 `tlsInsecure` 토글도 동일 |
| 4 | **감지 그리드** (FR-4.1) | 8×6 블록(마스크 존과 1:1) | PRD의 8×8 픽셀블록(20×15) 대신 마스크 편집기와 정합되는 8×6 셀. 마스크 적용이 직관적 |
| 5 | **AVI 텔레그램 전송** (D6) | 스냅샷 우선 전송 + 클립은 SD/대시보드 | 텔레그램은 MJPEG-AVI 인앱 재생 제한. 서버측 MP4 변환은 웹 라우트 과제 |
| 6 | **클립 클라우드 업로드** | ≤1.5MB만 업로드, 초과 시 SD/로컬 링크 | ESP32 RAM 한계. 원본 장기보관은 SD가 1차 저장소 |
| 7 | **파일명 충돌** | `webserver.*` → `localweb.*` 리네임 | macOS 대소문자 미구분 FS에서 사용자 `webserver.h`가 코어 `<WebServer.h>`를 가림 → 모듈명 변경으로 회피 |

## 컴파일 문제

- **`WiFiManager.h not found`** → `arduino-cli lib install "WiFiManager"`
- **`ArduinoJson deprecated` 경고 다수** → 정상. ArduinoJson 7의 `StaticJsonDocument`/
  `DynamicJsonDocument` 하위호환 경고(빌드 통과). 추후 `JsonDocument`로 마이그레이션 가능
- **`invalid option 'PSRAM'`** → `esp32cam` 보드는 PSRAM 항상 활성(보드 정의 내장).
  FQBN에 `PSRAM=...` 옵션을 붙이지 말 것
- **`WebServer does not name a type`** → 스케치에 `webserver.h`처럼 코어 헤더와
  대소문자만 다른 파일이 있으면 발생. 파일명을 바꾼다(본 프로젝트는 `localweb.*`)

## 런타임 문제

| 증상 | 원인 | 대응 |
|---|---|---|
| brownout 리셋 반복 | 전원 부족 | 5V 2A 이상, USB-TTL 5V로 상시구동 금지 (R1). 펌웨어는 brownout 감지 완화 적용 |
| 카메라 초기화 실패 | PSRAM/전원/케이블 | 3회 실패 시 재부팅, 5회 시 포털(FR-8.3). PSRAM 미검출 시 SVGA 자동 강등 |
| 텔레그램 미수신 | 봇에 `/start` 안 함 | 봇은 선대화 없이 발신 불가(R10). `/start` 후 자동 페어링 |
| 감지시각 부정확 | NTP 미동기 | 캡션에 `TIME_UNSYNCED` 표기, 동기 완료 시 소급 보정(FR-4.7) |
| 야간 오탐 | 가로등/벌레 | 마스크 존, 민감도↓, 쿨다운↑, IR 조명 |
| SD 마운트 실패 | 카드/포맷 | FAT32·Class10. 실패해도 메모리 전송 전용 모드로 알림 계속(FR-3.6) |
| 스트림 중 다른 기능 정지 | 단일 카메라·슈퍼루프 | `/stream`은 세션 동안 점유. 라이브뷰는 짧게 사용 |

## OTA / 파티션

- 빌드 전 `esptool.py flash_id`로 실제 플래시 확인(4MB vs 8MB, R13)
- 4MB: `partitions.csv`(app0/app1 각 1.875MB, coredump). SPIFFS 없음(미디어는 SD)
- 새 이미지 부팅 후 자가점검(카메라·WiFi) 통과해야 유효 확정, 실패 시 이전 이미지 롤백(FR-6.3.3)
- `manifest.json`의 `sha256` 불일치 시 기록 중단·롤백
