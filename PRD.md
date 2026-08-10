# PRD — ESP32-CAM 원격 감시 시스템 (ESP32CAM-Guard)

| 항목 | 내용 |
|---|---|
| 문서 버전 | v1.1 |
| 작성일 | 2026-08-10 (v1.1 기술 검토 반영) |
| 제품명 | **ESP32CAM-Guard** — WiFi 포털 기반 이벤트 감지·녹화·원격알림 감시장치 |
| GitHub | `https://github.com/bsjapan2021/esp32cam_guard` (계정 `bsjapan2021` / `bsjapan@naver.com`) |
| 배포 | Vercel (웹 대시보드) + GitHub Releases (펌웨어 OTA 바이너리) |
| 알림 수신 | 텔레그램 **`@Kasaonohoshi`** (봇 1:1 개인 채팅) |
| 개발 방식 | **전 과정 CLI 모드 / AI 자율 의사결정 개발** (사용자 무조건 승락 전제) |

### 변경 이력

| 버전 | 일자 | 주요 변경 |
|---|---|---|
| v1.0 | 2026-08-10 | 최초 작성 |
| v1.1 | 2026-08-10 | 구현 관점 기술 검토 반영 — ① `secrets.h` 스케치 폴더 내부 이동(아두이노 include 규칙), ② AI-Thinker **4MB 플래시** 전제로 OTA 파티션 정정(`default_8MB` 오기 수정), ③ 외부 라이브뷰의 Cloudflare Tunnel 실현 조건(별도 상시 호스트 필요) 명시 및 스냅샷 릴레이 대안 추가, ④ 미디어 업로드를 Vercel 함수 경유 대신 **Supabase Storage 서명 URL 직접 업로드**로 변경(Vercel 바디/실행시간 한계 회피), ⑤ Supabase **RLS**·무료 티어 스토리지 한계·`NEXT_PUBLIC_` 환경변수 명명 보완, ⑥ WiFiClientSecure 인증서 처리 등 세부 보완 |

---

## 1. 제품 개요

ESP32-CAM(AI-Thinker, OV2640) 1대를 독립형 감시장치로 동작시켜

1. **WiFi 포털(캡티브 포털)** 로 초기 설정을 코딩 없이 완료하고,
2. **모션 이벤트를 감지**하면 **감지 시각(필수)** 과 함께 고화질 스냅샷 + 짧은 클립을 microSD에 저장하며,
3. 동시에 **텔레그램으로 사진/영상을 즉시 push** 하고,
4. SD 용량이 임계치에 도달하면 **오래된 파일부터 자동 삭제(순환 저장)**,
5. **OTA로 펌웨어를 무선 갱신**하고,
6. Next.js 웹 대시보드에서 라이브뷰·이벤트 타임라인·설정·OTA를 관리한다.

### 1.1 핵심 사용자 시나리오

| # | 시나리오 | 기대 동작 |
|---|---|---|
| S1 | 사용자가 장치에 전원을 넣는다 (최초) | 5초 내 **`GBSA0001`** AP 생성(PW `GBSA0001`) → 폰으로 접속 → 캡티브 포털에서 WiFi·텔레그램·장치명 입력 → 자동 재부팅·연결 |
| S2 | 창고에 사람이 들어온다 | 1초 내 모션 감지 → **2026-08-10 14:32:07 (KST)** 각인된 UXGA 스냅샷 + 5초 클립 저장 → 3~8초 내 텔레그램 수신 |
| S3 | SD 32GB가 가득 찬다 | 여유 15% 미만 시 가장 오래된 이벤트 폴더부터 삭제, 녹화 중단 없음 |
| S4 | 기능 개선 펌웨어가 나온다 | 대시보드 "업데이트 확인" → GitHub Release 버전 비교 → HTTPS OTA → 자동 재부팅 → 버전 리포트 |
| S5 | 외부에서 상태 확인 | Vercel 대시보드에서 이벤트 타임라인·썸네일·기기 온라인 여부 확인 |

---

## 2. 시스템 아키텍처

```
┌──────────────────────────── 현장(LAN) ────────────────────────────┐
│  ESP32-CAM (AI-Thinker)                                          │
│   ├─ OV2640 카메라 (UXGA 스냅샷 / SVGA·HD 클립)                    │
│   ├─ microSD (SD_MMC 1-bit) — 순환 저장                           │
│   ├─ PIR(옵션, GPIO13) + 프레임차분 모션 엔진                       │
│   ├─ WiFiManager 캡티브 포털 + NVS 설정 저장                        │
│   ├─ NTP(kr.pool.ntp.org, KST) 시각 동기화 ★감지시각 필수           │
│   ├─ HTTP 서버 :80  (/stream /snapshot /api/*)                    │
│   └─ OTA (ArduinoOTA + HTTPS GitHub Release)                     │
└───────┬───────────────────────────────┬──────────────────────────┘
        │ ① Telegram Bot API (HTTPS)     │ ② Event Push (HTTPS POST)
        ▼                               ▼
   ┌─────────┐                  ┌──────────────────────────────┐
   │ Telegram│                  │ Vercel (Next.js 15 App Router)│
   │  사용자  │                  │  ├─ /api/ingest  이벤트 수신   │
   └─────────┘                  │  ├─ Supabase Postgres (메타)  │
                                │  ├─ Supabase Storage (미디어) │
                                │  └─ 대시보드 UI (React/TW)    │
                                └──────────────────────────────┘
        ③ 라이브 스트림: 동일 LAN 직접접속 / Cloudflare Tunnel(옵션)
```

### 2.1 자율 결정된 아키텍처 판단 (Design Decisions)

| ID | 쟁점 | 결정 | 근거 |
|---|---|---|---|
| D1 | Vercel에서 LAN 안의 ESP32-CAM에 직접 접근 불가 | **Push 모델** 채택 — 장치가 이벤트를 클라우드로 올림 | 포트포워딩·공인IP 불필요, 보안 우수 |
| D2 | 라이브 스트림 경로 | LAN 내에서는 직접 MJPEG, 외부는 **① 클라우드 스냅샷 릴레이(기본)** 또는 **② Cloudflare Tunnel(고급, 별도 상시 호스트 필요)** | ESP32는 동시 스트림 1~2개가 한계. cloudflared 데몬은 ESP32에서 구동 불가 |
| D3 | 영상 포맷 | **MJPEG-in-AVI** (.avi) | ESP32는 H.264 HW 인코더 없음. MJPEG가 유일한 실용 해법 |
| D4 | "고화질" 정의 | 스냅샷 **UXGA 1600×1200**, 클립 **HD 1280×720 @ ~10fps**(PSRAM 필수) | UXGA 연속 녹화는 fps 3 미만으로 실사용 불가 |
| D5 | 클라우드 저장소 | Supabase (Postgres + Storage) | 무료 티어에서 DB+오브젝트 저장 통합, Vercel 연동 용이 |
| D6 | 텔레그램 전송물 | 스냅샷 JPEG + **3초 미리보기 GIF/MP4급 저압축 클립** | Telegram `sendVideo` 는 MJPEG-AVI 미지원 → 서버측 변환 or `sendAnimation` |
| D7 | 시각 신뢰성 | NTP + 부팅 시 강제 동기화, 미동기 시 이벤트 캡션에 `TIME_UNSYNCED` 표기 | 감지시각은 필수 요구사항이므로 무결성 표시 필요 |

> **D6 보충**: ESP32에서 만든 AVI는 텔레그램 인앱 재생이 안 될 수 있어, 기본은 ①스냅샷 즉시 전송 + ②원본 클립 링크(대시보드 URL) 동봉, 옵션으로 ③서버(Vercel Route Handler)에서 MP4 변환 후 재전송을 지원한다.
>
> **D2 보충 (외부 라이브뷰)**: Cloudflare Tunnel(`cloudflared`)은 **ESP32 위에서 직접 실행할 수 없다**(별도 데몬·상시 프로세스 필요). 따라서 외부 라이브뷰가 필요하면 동일 LAN에 항상 켜져 있는 호스트(라즈베리파이·미니PC·공유기)가 있어야 하며, 이 요건이 부담되는 일반 사용자를 위해 **기본 경로는 "클라우드 스냅샷 릴레이"** 로 한다. 대시보드에서 라이브 요청 → 클라우드가 장치의 다음 하트비트/롱폴에 촬영 명령 첨부 → 장치가 `/api/ingest/media` 로 최신 스냅샷 업로드 → 대시보드가 1~3초 주기로 폴링해 준(準)실시간 뷰를 제공(진정한 30fps 스트림은 LAN 한정). 상시 호스트 보유 사용자만 Cloudflare Tunnel 또는 Tailscale Funnel 옵션을 선택한다.

> **D8 추가 (플래시 용량 전제)**: 대상 보드 AI-Thinker ESP32-CAM은 통상 **4MB 플래시**다. OTA(양면 파티션)를 위해 SPIFFS/LittleFS를 두지 않고 앱 파티션 2면(각 ~1.9MB)만 배치하는 커스텀 `partitions_ota.csv` 를 사용한다(미디어는 SD 저장이므로 내부 파일시스템 불필요). 8MB 플래시 클론일 경우에만 `default_8MB` 계열을 쓴다. 빌드 전 `esptool.py flash_id` 로 실제 플래시 용량을 확인한다.

---

## 3. 하드웨어 요구사항

| 부품 | 사양 | 비고 |
|---|---|---|
| MCU | ESP32-CAM AI-Thinker (ESP32-S, **PSRAM 4MB 필수**) | PSRAM 없으면 HD 프레임버퍼 불가 |
| 카메라 | OV2640 (기본 동봉) | FOV 66°, 야간용은 OV2640+IR 모듈 권장 |
| 저장 | microSD Class10 **16~64GB**, FAT32 | SD_MMC **1-bit 모드** 고정 (4-bit는 GPIO4 플래시와 충돌) |
| 전원 | 5V / **2A 이상** DC | 부족 시 brownout 리셋·카메라 초기화 실패 |
| 모션 보조 | HC-SR501 PIR → **GPIO13** (옵션) | 딥슬립 웨이크업 소스로 사용 가능 |
| 상태표시 | 온보드 LED GPIO33(빨강), 플래시 GPIO4(백색) | 플래시는 야간 캡처 시 순간 점등 |
| 프로그래머 | USB-TTL(CH340/CP2102) 또는 ESP32-CAM-MB | GPIO0-GND 부팅 |

**핀 점유 표**

| 기능 | 핀 |
|---|---|
| 카메라 데이터/제어 | GPIO 0,5,18,19,21,22,23,25,26,27,32,34,35,36,39 |
| SD_MMC 1-bit | GPIO 2(D0), 14(CLK), 15(CMD) |
| 플래시 LED | GPIO 4 |
| 상태 LED | GPIO 33 |
| **사용 가능 여분** | GPIO 13(PIR), GPIO 12(부저/입력, 부팅 시 LOW 유지 필요) |

---

## 4. 펌웨어 기능 요구사항

### FR-1. WiFi 캡티브 포털 (와이파이 포털)

- **FR-1.1** 저장된 자격증명이 없거나 연결 실패(15초 타임아웃 × 2회) 시 **AP 모드** 진입.

  | 항목 | 값 | 비고 |
  |---|---|---|
  | AP SSID | **`GBSA0001`** | `config.h` 의 `AP_SSID` 상수 |
  | AP 비밀번호 | **`GBSA0001`** | WPA2, 8자 (최소 요건 충족) |
  | AP IP | `192.168.4.1` | 고정 |
  | 채널 / 최대접속 | 1 / 2 | 동시 설정 세션 제한 |
  | SSID 숨김 | 미사용(브로드캐스트) | 초기 설정 편의 |

  - **FR-1.1.1** 다중 기기 운용 시 SSID 충돌을 막기 위해 `AP_SSID_SUFFIX` 옵션(기본 **OFF**)을 둔다. ON이면 `GBSA0001-A3F2` 형태로 MAC 하위 4자리를 붙인다. 1대 운용이 기본이므로 기본값은 접미사 없는 순수 `GBSA0001`.
  - **FR-1.1.2** AP SSID/비밀번호는 포털 및 대시보드 설정에서 변경 가능하며, 변경값은 NVS에 저장된다. 팩토리 리셋(FR-1.5) 시 `GBSA0001` / `GBSA0001` 로 복귀한다.
  - **FR-1.1.3** 포털 진입 시 텔레그램 알림은 불가하므로(인터넷 미연결), 상태 LED(GPIO33)를 **1초 주기 점멸**로 AP 모드임을 표시한다.
- **FR-1.2** 캡티브 포털(DNS 하이재킹, `192.168.4.1`) 자동 팝업. 라이브러리: **WiFiManager (tzapu)** 사용.
  - **FR-1.2.1 [스킬 참조]** 포털 구현은 사용자가 보유한 **「와이파이 포털 스킬」의 표준 구현을 우선 적용**한다. 스킬과 본 문서(FR-1.1~FR-1.6)가 충돌할 경우 **스킬이 우선**하며, 본 문서의 항목은 스킬이 다루지 않는 영역(텔레그램 파라미터, device_key 등)에만 적용한다.
    > ⚠️ **미해결 의존성**: 현재 개발 세션에 해당 스킬이 로드되어 있지 않다. 구현 착수 전 스킬 파일(`SKILL.md` 및 참조 코드)을 제공받아야 하며, 제공 전까지는 아래 FR-1.2.2 의 자체 구현 규약을 임시 기준으로 사용한다.
  - **FR-1.2.2 (스킬 미제공 시 대체 규약)** 캡티브 포털 최소 동작 정의
    | 항목 | 규약 |
    |---|---|
    | DNS | 포트 53 와일드카드 응답 → 모든 도메인을 `192.168.4.1` 로 |
    | OS 감지 | iOS `/hotspot-detect.html`, Android `/generate_204`, Windows `/ncsi.txt` 에 302 리다이렉트 |
    | 포털 UI | 단일 HTML(인라인 CSS), 한국어, 모바일 320px 대응 |
    | 스캔 | 주변 AP 목록 자동 스캔 + RSSI 표시 + 수동 SSID 입력 |
    | 검증 | 저장 전 WiFi 접속 시도 → 실패 시 포털 유지 및 사유 표시 |
    | 텔레그램 검증 | 저장 시 `getMe` + 테스트 메시지 1건 발송으로 토큰/Chat ID 유효성 즉시 확인 |
    | 타임아웃 | 설정 미완료 상태 **5분** 경과 시 자동 재부팅(정전 복구 후 무한 대기 방지) |
- **FR-1.3** 포털 커스텀 입력 필드
  | 키 | 라벨 | 필수 | 기본값 |
  |---|---|---|---|
  | `device_name` | 장치 이름 | ✔ | `CAM-01` |
  | `tg_token` | 텔레그램 봇 토큰 | ✔ | — |
  | `tg_chat_id` | 텔레그램 Chat ID (숫자) | ✔ | — |
  | `tg_username` | 수신자 텔레그램 ID | ✖ | **`@Kasaonohoshi`** (표시·검증용) |
  | `cloud_url` | 클라우드 수집 URL | ✖ | `https://esp32cam-guard.vercel.app/api/ingest` |
  | `device_key` | 장치 인증 키 | ✔ | 자동생성(32자) |
  | `motion_sens` | 모션 민감도 1~10 | ✖ | `5` |
  | `tz_offset` | 표준시(분) | ✖ | `540` (KST) |
  | `clip_sec` | 클립 길이(초) | ✖ | `5` |
- **FR-1.4** 설정은 **NVS(Preferences)** 에 저장. SD의 `/config.json` 에도 백업하고, 부팅 시 SD 우선 복원 옵션 제공.
- **FR-1.5** GPIO0을 부팅 후 5초간 GND 접지하면 **설정 초기화(팩토리 리셋)** → 포털 재진입.
- **FR-1.6** 운영 중에도 `/api/portal` 호출 또는 대시보드 버튼으로 포털 강제 진입 가능.

### FR-2. 카메라 & 고화질 저장

- **FR-2.1** 카메라 초기화: `PIXFORMAT_JPEG`, `frame_size=FRAMESIZE_HD`, `jpeg_quality=10`, `fb_count=2` (PSRAM 감지 시). PSRAM 미검출 시 SVGA·quality 12로 자동 강등하고 경고 로그.
- **FR-2.2** 이벤트 스냅샷은 **UXGA(1600×1200), quality 8** 로 별도 캡처.
- **FR-2.3** 이벤트 클립은 **MJPEG-AVI** 컨테이너로 `clip_sec`(기본 5초, 최대 15초) 저장. 프리롤 버퍼 **2초**(RAM 링버퍼)를 포함해 감지 순간 이전 장면도 남긴다.
- **FR-2.4** 파일 경로 규칙
  ```
  /DCIM/2026-08-10/EVT_20260810_143207_001.jpg      ← 스냅샷
  /DCIM/2026-08-10/EVT_20260810_143207_001.avi      ← 클립
  /DCIM/2026-08-10/EVT_20260810_143207_001.json     ← 메타(감지시각·트리거·점수)
  /LOG/system_20260810.log
  ```
- **FR-2.5** 모든 저장 프레임 좌상단에 **`YYYY-MM-DD HH:MM:SS KST`** 텍스트 오버레이를 그려 넣는다(JPEG 디코딩 부담을 피하기 위해 `esp32-camera` 의 `draw` 유틸 또는 RGB565 소형 버퍼에 렌더 후 재인코딩; 불가 시 파일명·메타·캡션 3중 기록으로 대체 — **감지시각 누락은 절대 불가**).
- **FR-2.6** 상시 녹화 모드(옵션, 기본 OFF): 5분 단위 세그먼트 AVI를 `/REC/` 에 연속 저장.

### FR-3. 순환 저장 (용량 관리)

- **FR-3.1** 부팅 시 및 매 이벤트 저장 직전 SD 여유 공간을 계산한다.
- **FR-3.2** **여유 < 15%** 또는 **여유 < 300MB** 이면 정리 루틴 실행.
- **FR-3.3** 삭제 순서: `/DCIM/` 하위의 **가장 오래된 날짜 폴더**부터 → 폴더 내 파일 오름차순 삭제 → 빈 폴더 제거. 여유가 **25%** 를 회복할 때까지 반복.
- **FR-3.4** 삭제 이력은 `/LOG/purge.log` 및 시스템 로그에 남기고, 대시보드 `storage` 상태에 최근 정리 시각을 노출한다.
- **FR-3.5** `protected=true` 로 표시(대시보드에서 잠금)한 이벤트는 삭제 대상에서 제외. 단, 보호 파일이 용량의 50%를 넘으면 경고 알림 전송.
- **FR-3.6** SD 미장착/마운트 실패 시에도 텔레그램 알림 기능은 계속 동작(메모리 전송 전용 모드) + 부팅 알림으로 상태 통보.

### FR-4. 이벤트 감지

- **FR-4.1** **프레임 차분 방식**: QQVGA(160×120) 그레이스케일로 다운샘플 → 8×8 블록 평균 → 직전 프레임 대비 절대차 합산 → 변화 블록 비율이 임계치 초과 시 감지.
- **FR-4.2** 민감도 1~10 → 임계 블록비율 20%~2% 로 매핑. 대시보드/포털에서 실시간 조정.
- **FR-4.3** **PIR(GPIO13)** 이 연결되면 OR 조건으로 트리거. `trigger` 필드에 `motion` / `pir` / `both` / `manual` 기록.
- **FR-4.4** **쿨다운**: 기본 20초(설정 5~300초). 쿨다운 중 재감지는 동일 이벤트의 `hitCount` 로 누적.
- **FR-4.5** **마스크 존**: 8×6 그리드에서 무시 영역 지정(가로등·나뭇가지 오탐 방지). 대시보드에서 클릭 편집 → 비트마스크로 NVS 저장.
- **FR-4.6** **스케줄**: 감시 활성 시간대(예: 19:00~07:00) 및 요일 설정. 비활성 시간에는 트리거 무시.
- **FR-4.7** **감지 시각 기록(필수, MUST)** — 다음 5곳 전부에 동일한 KST 시각을 기록한다.
  1. 파일명 `EVT_YYYYMMDD_HHMMSS_NNN`
  2. 메타 JSON `detectedAt`(ISO8601, `2026-08-10T14:32:07+09:00`) + `epoch`
  3. 프레임 오버레이 텍스트
  4. 텔레그램 캡션 첫 줄
  5. 클라우드 이벤트 레코드 `detected_at`
  NTP 미동기 상태면 `timeSynced:false` 와 부팅 후 경과시간(`uptimeMs`)을 함께 기록하고, 동기화 완료 시 해당 이벤트의 시각을 보정하는 후처리를 수행한다.

### FR-5. 텔레그램 원격 알림

- **FR-5.0 수신 대상 계정**

  | 항목 | 값 |
  |---|---|
  | 알림 수신자 텔레그램 ID | **`@Kasaonohoshi`** (여승훈) |
  | 수신 방식 | 봇 → 1:1 개인 채팅 (기본), 그룹/채널 확장 가능 |
  | 봇 계정 | @BotFather 로 발급 완료 |
  | **봇 ID** | **`8875648089`** (토큰의 콜론 앞 숫자, 공개 가능) |
  | **봇 토큰** | `8875648089:AAE0****************************qew` — **본 문서에 전문 미기재** |
  | 토큰 실제 보관 위치 | ① 장치: NVS(`tg_token`) ② 개발 PC: `firmware/esp32cam_guard/secrets.h` (스케치 폴더 내부여야 컴파일 포함됨) ③ 웹: `.env.local` — **세 곳 모두 `.gitignore` 대상** |
  | API 엔드포인트 | `https://api.telegram.org/bot<TOKEN>/<method>` |

  - **FR-5.0.1 (중요)** Telegram Bot API의 `sendPhoto`/`sendMessage` 는 **개인 사용자에게 `@사용자명`을 chat_id로 사용할 수 없다.** 반드시 **숫자 chat_id**(예: `1234567890`)가 필요하다. 따라서 `@Kasaonohoshi` 는 소유자 식별·표시·검증 용도로만 저장하고, 실제 전송에는 `tg_chat_id` 를 사용한다.
  - **FR-5.0.2 chat_id 확보 절차** (설치 가이드 및 포털 도움말에 명시)
    1. 텔레그램에서 봇 검색 → **`/start`** 전송 (이 단계를 거쳐야 봇이 사용자에게 메시지를 보낼 수 있음)
    2. `https://api.telegram.org/bot<TOKEN>/getUpdates` 호출 → `message.chat.id` 확인
    3. 또는 `@userinfobot` 에 `/start` → 숫자 ID 확인
  - **FR-5.0.3 자동 페어링(권장 구현)** 포털에서 chat_id를 비워두면, 부팅 후 봇이 `getUpdates` 를 폴링해 **`@Kasaonohoshi` 로부터 온 첫 `/start` 메시지의 chat_id를 자동 등록**하고 NVS에 저장한 뒤 확인 메시지를 회신한다. 사용자가 ID를 직접 찾을 필요가 없어진다.
  - **FR-5.0.4** 등록된 `tg_username` 과 실제 발신자 `from.username` 이 불일치하면 명령을 거부하고 경고 로그를 남긴다(FR-5.6과 연동).
  - **FR-5.0.5 토큰 취급 규칙 (MUST)**
    | 규칙 | 내용 |
    |---|---|
    | 저장소 커밋 금지 | PRD·README·소스 어디에도 토큰 전문을 넣지 않는다. `secrets.h` / `.env.local` 은 `.gitignore` 등록 |
    | 템플릿 제공 | `firmware/esp32cam_guard/secrets.example.h`, `web/.env.example` 에 키 이름만 기재 |
    | 로그 마스킹 | 시리얼·`/api/status`·대시보드 어디서도 `8875648089:AAE0…qew` 형태로만 노출 |
    | 주입 경로 | 운영 시에는 **캡티브 포털 입력 → NVS 저장**이 정식 경로. 소스 하드코딩은 개발 편의용 임시 수단으로만 허용 |
    | 유출 시 | @BotFather → `/revoke` 로 즉시 재발급 후 포털에서 갱신 |
    | 검증 | 저장 직후 `getMe` 호출로 토큰 유효성 확인, 실패 시 포털 유지 |

- **FR-5.1** 감지 즉시(목표 **≤8초**) 텔레그램 `sendPhoto` 로 UXGA 스냅샷 전송.
- **FR-5.2** 이어서 짧은 클립을 `sendVideo`/`sendAnimation` 로 전송(옵션 ON 시). 3.5MB 초과 시 자동으로 프레임 축소 재인코딩 또는 링크 대체.
- **FR-5.3** 캡션 포맷
  ```
  🚨 움직임 감지
  🕒 2026-08-10 14:32:07 (KST)
  📍 CAM-01 / 창고 출입구
  🎯 트리거: motion (점수 37%)
  💾 EVT_20260810_143207_001
  🔋 WiFi -58dBm · SD 62% 사용
  🔗 https://esp32cam-guard.vercel.app/e/<id>
  ```
- **FR-5.4** 인라인 버튼: `📸 지금 촬영` `🔇 30분 음소거` `🔴 녹화 시작` `⚙️ 상태`.
- **FR-5.5** 봇 명령어: `/status` `/photo` `/clip` `/mute <분>` `/unmute` `/storage` `/reboot` `/version` `/ota`.
- **FR-5.6** 인가된 `chat_id`(= `@Kasaonohoshi` 의 숫자 ID) 외의 메시지는 무시하고 로그에 남긴다. 미인가 접근 3회 누적 시 관리자에게 경고 알림.
- **FR-5.7** 전송 실패 시 지수 백오프 재시도(3회, 2·4·8초). 최종 실패한 이벤트는 SD의 `/QUEUE/pending.json` 에 적재해 네트워크 복구 시 순차 재전송(최대 50건).
- **FR-5.8** 시스템 알림: 부팅 완료, WiFi 재연결, SD 오류, 용량 정리 실행, OTA 성공/실패, 24시간 무이벤트 하트비트(옵션).
- **FR-5.9 (TLS 처리)** 텔레그램·클라우드·GitHub 통신은 `WiFiClientSecure` 로 수행한다. 메모리 절약을 위해 각 도메인의 **루트 CA 인증서**(텔레그램: Go Daddy/Let's Encrypt 계열, GitHub: DigiCert/Sectigo 계열)를 펌웨어에 내장해 검증하는 것을 기본으로 하되, 인증서 만료·교체로 인한 현장 장애 위험을 고려해 **`setInsecure()` 폴백 옵션**(기본 OFF, 포털/설정에서 토글)을 제공한다. 인증서 검증 실패 시 사유를 로그·`/api/status` 에 남긴다. `UniversalTelegramBot` 사용 시에도 동일한 보안 클라이언트를 주입한다.

### FR-6. OTA 업데이트

- **FR-6.1** **로컬 OTA (ArduinoOTA)**: 동일 LAN에서 `arduino-cli`/`espota.py` 로 무선 업로드. 호스트명 `gbsa0001-<MAC4>.local`, 비밀번호는 `device_key` 파생값.
- **FR-6.2** **HTTPS OTA (원격, 주 경로)**: `https://github.com/bsjapan2021/esp32cam_guard/releases/latest/download/manifest.json` 을 조회해 `version`(SemVer) 비교 → 최신이면 `firmware.bin` 다운로드 → `Update` 라이브러리로 기록 → 재부팅.
  ```json
  {
    "version": "1.2.0",
    "build": "20260810.1",
    "url": "https://github.com/bsjapan2021/esp32cam_guard/releases/download/v1.2.0/firmware.bin",
    "sha256": "…",
    "size": 1245184,
    "minVersion": "1.0.0",
    "notes": "모션 마스크 존 추가"
  }
  ```
- **FR-6.3** **무결성 검증**: 다운로드 후 SHA-256 비교 실패 시 기록 중단·롤백. 파티션은 **양면 OTA** 를 사용해 실패 시 이전 이미지로 부팅한다.
  - **FR-6.3.1 (플래시 용량 주의)** AI-Thinker ESP32-CAM은 대개 **4MB 플래시**이므로 8MB 전용 테이블(`default_8MB`)을 그대로 쓰면 안 된다. 4MB에서는 커스텀 `partitions_ota.csv`(부트로더/nvs/otadata + **app0·app1 각 ~1.9MB** + coredump)로 배치하고, 미디어는 SD에 저장하므로 SPIFFS/LittleFS 파티션은 생략한다. 8MB 클론일 때만 `default_8MB` 계열을 사용한다.
  - **FR-6.3.2** 빌드 전 `esptool.py flash_id` 로 실제 플래시 용량을 확인하고, 펌웨어 부팅 로그와 `/api/status` 에 감지된 플래시 크기·사용 중 파티션 스킴을 노출한다.
  - **FR-6.3.3** 롤백은 `esp_ota_mark_app_valid_cancel_rollback()` / `esp_ota_mark_app_invalid_rollback_and_reboot()` 기반. 새 이미지 부팅 후 자가 점검(카메라 초기화·WiFi·NTP)을 통과해야 유효 표시하고, 실패 시 자동으로 이전 이미지로 롤백한다.
- **FR-6.4** 트리거 경로 3종: ① 대시보드 버튼, ② 텔레그램 `/ota`, ③ 자동 확인(기본 24시간 주기, 자동 적용은 기본 OFF).
- **FR-6.5** 업데이트 전 진행 중인 녹화를 정상 종료하고 SD를 언마운트한다. 진행률은 10% 단위로 텔레그램 편집 메시지에 갱신.
- **FR-6.6** OTA 중 전원 차단 대비: 배터리·UPS 미보유 환경이므로 `Update.onProgress` 로그와 실패 시 자동 재시도(1회)를 둔다.

### FR-7. 로컬 HTTP API (장치)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/` | 간이 로컬 UI(단일 HTML, 라이브뷰+설정) |
| GET | `/stream` | MJPEG multipart 스트림 (동시 1세션) |
| GET | `/snapshot` | 단일 JPEG (`?size=uxga\|hd\|svga`) |
| GET | `/api/status` | 버전·업타임·RSSI·SD사용률·시각동기·이벤트수 |
| GET | `/api/events?limit=50` | 최근 이벤트 메타 목록 |
| GET | `/api/file?path=` | SD 파일 다운로드 |
| POST | `/api/config` | 설정 변경(JSON) |
| POST | `/api/capture` | 수동 이벤트 발생 |
| POST | `/api/ota/check` `/api/ota/apply` | OTA 확인·실행 |
| POST | `/api/reboot` `/api/portal` `/api/purge` | 재부팅·포털 진입·강제 정리 |

- 모든 `/api/*` 는 헤더 `X-Device-Key: <device_key>` 필수. CORS는 대시보드 오리진만 허용.

### FR-8. 안정성

- **FR-8.1** 하드웨어 워치독(TWDT 30초) 활성화, 루프 정지 시 자동 리셋.
- **FR-8.2** WiFi 끊김 시 10초 간격 재연결, 10회 실패 시 재부팅.
- **FR-8.3** 카메라 초기화 실패 3회 시 재부팅, 5회 누적 시 포털 모드로 진입해 사용자 개입 요청.
- **FR-8.4** 힙 여유 40KB 미만 지속 시 스트림 세션 강제 종료.
- **FR-8.5** 태스크 분리(FreeRTOS): `camTask`(core0, 캡처/감지) / `netTask`(core1, HTTP·텔레그램·업로드) — 감지 지연이 네트워크 I/O에 막히지 않도록.

---

## 5. 웹 대시보드 요구사항 (Next.js)

### 5.1 기술 스택

| 레이어 | 선택 |
|---|---|
| 프레임워크 | **Next.js 15 (App Router, Server Actions)** |
| 언어 | **TypeScript** (strict) |
| UI | **React 19 + Tailwind CSS 4** + shadcn/ui + lucide-react |
| 상태/데이터 | TanStack Query, Zod(스키마 검증) |
| 차트 | Recharts (이벤트 히트맵·시간대 분포) |
| DB/스토리지 | Supabase Postgres + Supabase Storage |
| 실시간 | Supabase Realtime (이벤트 신규 도착 push) |
| 배포 | Vercel (`vercel --prod`, CLI) |

### 5.2 화면 구성

| # | 라우트 | 화면 | 주요 요소 |
|---|---|---|---|
| P1 | `/` | **대시보드** | 기기 카드(온라인/오프라인·RSSI·SD게이지·펌웨어 버전), 최근 이벤트 6개 썸네일, 24시간 이벤트 막대그래프 |
| P2 | `/live` | **라이브 뷰** | LAN 직접 MJPEG `<img>`, 스냅샷 촬영, 플래시 토글, 해상도 전환, 연결 실패 시 안내 |
| P3 | `/events` | **이벤트 타임라인** | 날짜/트리거/기기 필터, **감지시각 대형 표기**, 무한 스크롤, 썸네일 그리드/리스트 전환, 보호(잠금)·삭제 |
| P4 | `/events/[id]` | **이벤트 상세** | 스냅샷 원본, 클립 플레이어, 메타(감지시각·점수·트리거·RSSI), 원본 다운로드, 텔레그램 재전송 |
| P5 | `/settings` | **설정** | 민감도 슬라이더, 마스크 존 8×6 그리드 에디터, 쿨다운, 클립 길이, 스케줄, 용량 임계치, 텔레그램 테스트 전송 |
| P6 | `/ota` | **펌웨어 관리** | 현재/최신 버전, 릴리스 노트, 업데이트 실행, 진행률, 이력 |
| P7 | `/devices` | **기기 관리** | 기기 등록(device_key), 이름/위치, 마지막 통신 시각, 삭제 |

### 5.3 UI 원칙

- 다크 모드 기본(야간 모니터링 가정), 시스템 설정 연동.
- **감지 시각은 어디서든 1순위 정보** — 카드 상단 `14:32:07`, 보조로 `2026-08-10 (월)`, `3분 전` 상대시간 병기.
- 모바일 우선(360px~), 이벤트 카드 탭 시 전체화면 뷰어.
- 접근성: 대비 4.5:1 이상, 키보드 내비게이션, 이미지 `alt` 에 감지시각 포함.
- 오프라인/에러 상태를 빈 화면이 아닌 명확한 안내 카드로 표시.

### 5.4 클라우드 API 명세

| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| POST | `/api/ingest` | `X-Device-Key` | 장치 → 이벤트 메타 + **소형 썸네일(≤ 수십 KB)** 수신 및 events 레코드 생성 |
| POST | `/api/ingest/media/sign` | `X-Device-Key` | 원본 스냅샷/클립 업로드용 **Supabase Storage 서명 URL 발급**(장치가 이 URL로 직접 업로드) |
| POST | `/api/ingest/media/complete` | `X-Device-Key` | 업로드 완료 통보 → events의 `snapshot_url`/`clip_url` 갱신 |
| POST | `/api/heartbeat` | `X-Device-Key` | 1분 주기 상태 보고(온라인 판정 3분). 응답에 대기 중 원격 명령(촬영·OTA 등) 첨부 가능 |
| GET | `/api/events` | 세션 | 목록 조회(페이지네이션·필터) |
| GET | `/api/events/[id]` | 세션 | 상세 |
| PATCH | `/api/events/[id]` | 세션 | 보호/삭제/메모 |
| GET | `/api/devices` | 세션 | 기기 목록·상태 |
| POST | `/api/ota/publish` | 세션 | manifest 갱신(관리자) |

> **업로드 아키텍처 (중요)**: Vercel 서버리스 함수는 요청 바디 크기(Hobby 기준 약 4.5MB)와 실행 시간 제한이 있어 **UXGA 스냅샷·수 MB 클립을 함수 경유로 받으면 안정성이 떨어진다.** 따라서 원본 미디어는 `/api/ingest/media/sign` 으로 받은 **Supabase Storage 서명 업로드 URL로 장치가 직접 PUT** 하고, Vercel 함수는 메타·소형 썸네일·서명 발급·완료 처리만 담당한다. 이렇게 하면 대용량 전송이 Vercel을 우회해 Supabase로 직접 흐른다.

### 5.5 데이터 모델 (Supabase)

```sql
create table devices (
  id            uuid primary key default gen_random_uuid(),
  device_key    text unique not null,
  name          text not null,
  location      text,
  fw_version    text,
  last_seen_at  timestamptz,
  rssi          int,
  sd_used_pct   int,
  time_synced   boolean default true,
  created_at    timestamptz default now()
);

create table events (
  id            uuid primary key default gen_random_uuid(),
  device_id     uuid references devices(id) on delete cascade,
  detected_at   timestamptz not null,          -- ★ 필수: 감지 시각
  detected_epoch bigint not null,
  time_synced   boolean not null default true, -- NTP 동기 여부
  trigger       text not null check (trigger in ('motion','pir','both','manual','schedule')),
  score         int,                            -- 변화 블록 비율 0~100
  hit_count     int default 1,
  snapshot_url  text,
  thumb_url     text,
  clip_url      text,
  local_path    text,                           -- SD 원본 경로
  protected     boolean default false,
  note          text,
  created_at    timestamptz default now()
);
create index on events (device_id, detected_at desc);
```

### 5.6 접근 제어 (RLS) 및 스토리지 정책

- **RLS 필수**: `devices`·`events` 테이블에 **Row Level Security 활성화**. 대시보드(세션) 조회는 Supabase Auth로 인증된 소유자만 허용하고, 장치 인제스트 경로(`X-Device-Key`)는 **service_role 키를 쓰는 서버 라우트에서만** DB에 기록한다(anon 키로 직접 쓰기 금지). service_role 키는 Vercel 환경변수에만 두고 클라이언트 번들에 절대 노출하지 않는다.
- **Storage 정책**: 미디어 버킷은 **비공개(private)** 로 두고, 대시보드에서 재생·다운로드 시 **단기 서명 URL**을 발급한다. 장치 업로드도 서명 URL 기반(FR 5.4)이라 버킷 공개가 불필요하다.
- **환경변수 명명**: 클라이언트에서 쓰는 값만 `NEXT_PUBLIC_` 접두사를 붙인다 — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. 반대로 `SUPABASE_SERVICE_ROLE_KEY`, `INGEST_DEVICE_KEY_SALT`, `TELEGRAM_BOT_TOKEN`(서버측 MP4 변환/재전송용) 등 비밀값은 접두사 없이 서버 전용으로 둔다.
- **보존/정리**: 무료 티어 스토리지 한계(FR/리스크 R12)를 고려해, 클라우드는 최근 N일(기본 7일)만 원본 미디어를 유지하고 그 이전은 썸네일·메타만 남기는 **클라우드측 순환 정리 크론**(Vercel Cron 또는 Supabase pg_cron)을 둔다. 원본 장기 보관은 SD가 1차 저장소.

---

## 6. 비기능 요구사항

| 구분 | 요구사항 | 목표치 |
|---|---|---|
| 성능 | 감지 → 텔레그램 도달 | ≤ 8초 (WiFi -65dBm 기준) |
| 성능 | 감지 판정 주기 | ≤ 1초 (QQVGA 차분) |
| 성능 | HD 클립 프레임레이트 | ≥ 8fps |
| 신뢰성 | 연속 무재부팅 가동 | ≥ 7일 |
| 신뢰성 | 이벤트 유실률 | < 1% (재전송 큐 포함) |
| 보안 | 통신 | 텔레그램/클라우드 모두 HTTPS. 장치 API는 device_key 헤더 인증 |
| 보안 | 비밀정보 | 봇 토큰은 NVS에만 저장, 로그·API 응답에 마스킹(`123456:AA…xyz`) |
| 보안 | 대시보드 | Supabase Auth(이메일 매직링크), 미인증 시 전 페이지 차단 |
| 보안 | DB/스토리지 | 모든 테이블 **RLS 활성**, 미디어 버킷 비공개+서명 URL, service_role 키는 서버 전용(클라이언트 노출 금지) — 5.6 참조 |
| 보안 | 저장소 | `.env.local` 은 커밋 금지, `.env.example` 제공, GitHub Secret Scanning 활성 |
| 유지보수 | 코드 | TS strict, ESLint+Prettier, 펌웨어는 모듈 분리(`camera/ motion/ storage/ notify/ ota/ portal/`) |
| 전력 | 상시 전원 가정 | 딥슬립 모드는 v2 과제(PIR 웨이크업) |

---

## 7. 저장소 구조

```
esp32cam_guard/
├─ firmware/
│  ├─ esp32cam_guard/
│  │  ├─ esp32cam_guard.ino
│  │  ├─ config.h            // 핀맵·기본값·버전
│  │  ├─ portal.cpp/.h       // WiFiManager 캡티브 포털
│  │  ├─ camera.cpp/.h       // 초기화·캡처·오버레이
│  │  ├─ motion.cpp/.h       // 프레임차분·마스크·쿨다운
│  │  ├─ storage.cpp/.h      // SD_MMC·AVI 라이터·순환삭제
│  │  ├─ timekeeper.cpp/.h   // NTP·KST·시각 포맷 ★
│  │  ├─ notify.cpp/.h       // 텔레그램 전송·큐·명령 폴링
│  │  ├─ cloud.cpp/.h        // /api/ingest 업로드
│  │  ├─ otaupd.cpp/.h       // ArduinoOTA + HTTPS OTA
│  │  ├─ webserver.cpp/.h    // /stream /snapshot /api/*
│  │  ├─ secrets.example.h   // 토큰 키 이름만 (커밋 O) ★스케치 폴더 내부
│  │  └─ secrets.h           // 실제 토큰 (커밋 X, .gitignore) ★스케치 폴더 내부
│  ├─ partitions_ota.csv
│  └─ build.sh               // arduino-cli 빌드·업로드 스크립트
├─ web/                      // Next.js 15
│  ├─ app/ (page.tsx, live/, events/, settings/, ota/, devices/, api/)
│  ├─ components/  lib/  types/
│  ├─ tailwind.config.ts  tsconfig.json
├─ supabase/schema.sql
├─ .github/workflows/
│  ├─ firmware.yml           // arduino-cli 빌드 → Release 업로드 + manifest.json
│  └─ web.yml                // lint·typecheck·build
├─ docs/ (하드웨어 결선도, 설치 가이드, 트러블슈팅)
├─ .gitignore               // secrets.h, .env.local, *.bin
├─ .env.example
├─ PRD.md
└─ README.md
```

---

## 8. 개발 워크플로우 (CLI 자율 진행)

모든 단계는 AI가 판단·실행하며 사용자 확인을 별도로 요청하지 않는다(사전 승락).

```bash
# 0. 사전 도구
arduino-cli version && node -v && gh auth status && vercel --version

# 1. 저장소 생성 및 초기화
gh repo create bsjapan2021/esp32cam_guard --private --description "ESP32-CAM 원격 감시 시스템"
git init && git remote add origin https://github.com/bsjapan2021/esp32cam_guard.git
git config user.name "bsjapan2021" && git config user.email "bsjapan@naver.com"

# 2. 펌웨어 환경
arduino-cli core install esp32:esp32
arduino-cli lib install "WiFiManager" "ArduinoJson" "UniversalTelegramBot"
# 2-0. 실제 플래시 용량 확인 (4MB vs 8MB 판별 후 파티션 선택)
esptool.py --port /dev/cu.usbserial-XXXX flash_id
# partitions_ota.csv 는 스케치 폴더(firmware/esp32cam_guard/)에 위치, PSRAM 활성 필수
arduino-cli compile --fqbn esp32:esp32:esp32cam:PSRAM=enabled,PartitionScheme=custom \
  --build-property build.partitions=partitions_ota firmware/esp32cam_guard
arduino-cli upload -p /dev/cu.usbserial-XXXX --fqbn esp32:esp32:esp32cam firmware/esp32cam_guard

# 3. 웹 스캐폴딩
npx create-next-app@latest web --ts --tailwind --app --eslint --src-dir=false
cd web && npm i @supabase/supabase-js @tanstack/react-query zod recharts lucide-react

# 4. 배포 (클라이언트 노출 값만 NEXT_PUBLIC_, 비밀값은 접두사 없이)
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY   # 서버 전용, 클라이언트 번들 금지
vercel --prod

# 5. 릴리스(OTA 배포)
gh release create v1.0.0 firmware/build/firmware.bin manifest.json --notes "초기 릴리스"
```

**브랜치 전략**: `main`(배포) ← `dev` ← `feat/*`. 커밋 컨벤션 `feat|fix|docs|chore(scope): 내용`.

---

## 9. 마일스톤

| M | 산출물 | 완료 기준 |
|---|---|---|
| **M0** | PRD 확정·저장소 생성 | 본 문서 커밋, 저장소·CI 골격 |
| **M1** | 부팅 + 캡티브 포털 + WiFi 연결 | 폰으로 설정 완료 후 자동 접속, NVS 저장/복원 |
| **M2** | 카메라 + SD 저장 + 시각 각인 | UXGA 스냅샷·HD 클립 저장, 파일명/메타/오버레이 시각 3중 일치 |
| **M3** | 모션 감지 + 쿨다운 + 마스크 | 오탐율 실환경 1시간 ≤ 3건 |
| **M4** | 텔레그램 알림 | 감지 후 8초 내 사진 수신, 캡션 시각 정확, 재전송 큐 동작 |
| **M5** | 순환 저장 | SD 강제 충전 시 오래된 폴더 자동 삭제·녹화 무중단 |
| **M6** | 로컬 HTTP API + 라이브 스트림 | `/stream` 5분 무중단, `/api/status` 정상 |
| **M7** | 클라우드 인제스트 + 대시보드 | Vercel 배포 완료, 이벤트 실시간 표시 |
| **M8** | OTA | GitHub Release → 무선 업데이트 성공, SHA-256 검증·롤백 확인 |
| **M9** | 안정화 | 72시간 연속 가동 무재부팅, 문서/README 완비 |

---

## 10. 인수 기준 (Definition of Done)

- [ ] 최초 부팅 시 **`GBSA0001`(PW `GBSA0001`)** AP가 생성되고 캡티브 포털이 자동으로 뜨며, 코딩 없이 WiFi·텔레그램 설정이 완료된다.
- [ ] 움직임 감지 시 **감지 시각이 파일명·메타·오버레이·텔레그램 캡션·대시보드 5곳 모두에 동일하게** 기록된다.
- [ ] 감지 후 8초 이내에 **`@Kasaonohoshi`** 계정으로 사진이 도착하고, 클립(또는 링크)이 이어서 도착한다.
- [ ] 봇에 `/start` 만 보내면 chat_id가 자동 등록되어 별도 조회 없이 알림이 연결된다.
- [ ] SD 여유가 15% 미만이 되면 가장 오래된 파일부터 자동 삭제되며 녹화가 끊기지 않는다.
- [ ] UXGA 스냅샷과 HD 클립이 정상 재생·다운로드된다.
- [ ] Vercel 대시보드에서 이벤트 타임라인·상세·설정 변경이 동작한다.
- [ ] GitHub Release 게시 후 대시보드/텔레그램에서 OTA를 실행해 버전이 갱신된다.
- [ ] 전원 재투입·WiFi 단절·SD 제거 상황에서 자동 복구된다.
- [ ] 72시간 연속 가동 시 재부팅 0회, 힙 누수 없음.
- [ ] 원본 미디어가 Vercel 함수를 거치지 않고 Supabase Storage로 직접 업로드되며, 비공개 버킷+서명 URL로만 조회된다.
- [ ] `devices`·`events` 테이블 RLS가 활성이고, service_role 키가 클라이언트 번들에 노출되지 않는다(빌드 산출물 검사 통과).
- [ ] 대상 보드의 실제 플래시 용량에 맞는 OTA 파티션으로 빌드되어 양면 OTA·롤백이 검증된다.

---

## 11. 리스크 및 대응

| # | 리스크 | 영향 | 대응 |
|---|---|---|---|
| R1 | ESP32-CAM 전원 부족으로 brownout | 재부팅 반복 | 5V 2A 이상 어댑터 명시, 부팅 시 brownout 카운터 로그 |
| R2 | HD 클립 저장 중 SD 쓰기 지연 | 프레임 드롭 | Class10 이상 요구, 링버퍼 + 별도 태스크 기록, 실패 시 SVGA 자동 강등 |
| R3 | 텔레그램 AVI 인앱 재생 불가 | 사용성 저하 | 스냅샷 우선 전송 + 대시보드 링크, 서버측 MP4 변환 옵션(D6) |
| R4 | Vercel에서 LAN 카메라 직접 접근 불가 | 라이브뷰 제한 | Push 모델 기본, 외부 라이브는 Cloudflare Tunnel 선택 설정 |
| R5 | NTP 실패로 감지시각 부정확 | **핵심 요구 훼손** | 부팅 시 강제 동기화·다중 서버, 미동기 표시 + 동기 후 소급 보정(FR-4.7) |
| R6 | 야간 오탐(가로등·벌레) | 알림 피로 | 마스크 존, 민감도 조정, 쿨다운, IR 조명 권장 |
| R7 | OTA 중 정전 | 벽돌화 | 양면 OTA 파티션 + SHA-256 검증 + 자동 롤백 |
| R8 | 봇 토큰 노출 | **제3자가 봇 탈취 → 알림 가로채기·스팸 발송** | FR-5.0.5 취급 규칙 준수. 토큰이 채팅·문서·커밋 등에 노출된 이력이 있으면 **@BotFather `/revoke` 로 즉시 재발급**. 저장소 비공개 + GitHub Secret Scanning 활성 |
| R9 | 동시 스트림 다수 접속 | 메모리 고갈 | 스트림 세션 1개 제한, 힙 임계 시 강제 종료(FR-8.4) |
| R10 | 사용자가 봇에 `/start` 를 누르지 않음 | **알림 전무** | 봇은 선(先) 대화 없이 개인에게 발신 불가. 설치 가이드 1단계로 명시 + 자동 페어링(FR-5.0.3) |
| R11 | 와이파이 포털 스킬 미확보 | 구현 방식 재작업 | FR-1.2.2 대체 규약으로 선행 개발, 스킬 입수 시 포털 모듈만 교체(모듈 분리 설계) |
| R12 | Supabase 무료 티어 용량 초과(스토리지 ~1GB, DB ~0.5GB) | 업로드 실패·서비스 중단 | 클라우드는 최근 N일 원본만 유지(순환 정리 크론, 5.6), SD가 1차 장기 저장소, 임계 도달 시 관리자 알림 |
| R13 | 4MB 플래시 보드에 8MB 파티션 적용 | 빌드 실패·부팅 불가 | 빌드 전 `esptool.py flash_id` 확인, 4MB 전용 `partitions_ota.csv` 기본값(FR-6.3.1) |
| R14 | Vercel 함수 바디/시간 제한으로 대용량 업로드 실패 | 미디어 유실 | 원본은 Supabase Storage 서명 URL 직접 업로드(5.4), 함수는 메타·서명만 처리 |
| R15 | 내장 루트 CA 만료로 TLS 검증 실패 | 알림·업로드 전면 중단 | CA 갱신 OTA 배포 경로 유지 + `setInsecure()` 폴백 토글(FR-5.9) |

---

## 12. 범위 외 (Out of Scope, v2 이후)

- 온디바이스 AI 객체 인식(사람/차량/동물 분류) — ESP32 성능 한계, 서버측 추론으로 검토
- 양방향 오디오, PTZ 제어
- 다중 카메라 동시 스트림 그리드(3대 이상)
- 배터리·태양광 딥슬립 운용
- 클라우드 장기 보관(30일 이상) 및 유료 스토리지 정책

---

## 13. 용어

| 용어 | 정의 |
|---|---|
| 이벤트 | 모션/PIR 트리거로 생성된 하나의 감지 단위(스냅샷+클립+메타) |
| 감지 시각 | 트리거가 확정된 순간의 KST 시각. 본 제품의 필수 기록 항목 |
| 순환 저장 | 용량 임계 도달 시 오래된 파일부터 자동 삭제하며 계속 기록하는 방식 |
| 프리롤 | 감지 이전 구간을 RAM 버퍼에서 확보해 클립 앞에 붙이는 기법 |
| device_key | 장치별 32자 인증 키. 클라우드·로컬 API 인증에 공용 사용 |
| chat_id | 텔레그램 대화 식별 숫자값. `@사용자명` 과 다르며 개인 발송에는 숫자값만 유효 |
| 자동 페어링 | 사용자가 봇에 `/start` 를 보내면 장치가 chat_id를 스스로 등록하는 절차 |
