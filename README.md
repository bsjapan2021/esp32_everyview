# 📷 ESP32CAM-Guard

WiFi 캡티브 포털 기반 **이벤트 감지·녹화·원격 알림 감시장치**.
ESP32-CAM(AI-Thinker, OV2640) 1대로 모션을 감지해 **감지 시각이 각인된** 고화질
스냅샷 + 클립을 microSD에 저장하고, 텔레그램으로 즉시 push, Next.js 웹 대시보드에서
라이브뷰·타임라인·설정·OTA를 관리한다.

> 상세 사양은 [PRD.md](PRD.md) 참조. 본 저장소는 PRD v1.1 기준으로 구현.

---

## 구성

```
esp32cam_guard/
├─ firmware/esp32cam_guard/   # ESP32-CAM 펌웨어 (Arduino / C++)
│  ├─ esp32cam_guard.ino      #  메인: 부팅 순서 · 이벤트 파이프라인 · 슈퍼루프
│  ├─ config.h  appstate.h    #  핀맵/기본값/버전 · 공유 상태
│  ├─ portal.*                #  WiFiManager 캡티브 포털 + 커스텀 설정 + NVS
│  ├─ timekeeper.*            #  NTP/KST 시각 ★ (감지시각 필수)
│  ├─ camera.*                #  OV2640 init/캡처/시각 오버레이
│  ├─ motion.*                #  프레임 차분 8x6 · 마스크 · 쿨다운 · 스케줄
│  ├─ storage.*               #  SD_MMC · MJPEG-AVI · 순환삭제 · 백업/큐
│  ├─ notify.*                #  텔레그램 사진/명령/자동페어링/재전송 큐
│  ├─ cloud.*                 #  /api/ingest · 하트비트 · 서명URL 업로드
│  ├─ otaupd.*                #  ArduinoOTA + HTTPS OTA(SHA-256·롤백)
│  ├─ localweb.*              #  /stream /snapshot /api/* (코어 WebServer.h 충돌 회피 명칭)
│  ├─ partitions.csv          #  4MB 양면 OTA 파티션 (코어 자동 감지)
│  └─ secrets.example.h       #  키 이름만(커밋 O) — secrets.h 는 커밋 X
├─ web/                       # Next.js 16 대시보드 (App Router · TS · Tailwind · Supabase)
├─ supabase/schema.sql        # Postgres 스키마 + RLS + Storage 정책
├─ .github/workflows/         # firmware.yml(빌드→Release+manifest) · web.yml
└─ docs/                      # 하드웨어 결선 · 설치 가이드 · 트러블슈팅
```

---

## 빠른 시작

### 1) 펌웨어

```bash
cd firmware
cp esp32cam_guard/secrets.example.h esp32cam_guard/secrets.h   # 비워둬도 됨(포털로 설정)
./build.sh                       # 컴파일만
./build.sh /dev/cu.usbserial-XXXX   # 플래시(포트 지정)
```

> AI-Thinker ESP32-CAM은 **PSRAM 항상 활성**(보드 정의 내장). 4MB 플래시 기준
> 커스텀 `partitions.csv`로 **양면 OTA**. 8MB 클론이면 `esptool.py flash_id`
> 확인 후 파티션 교체(FR-6.3.1).

### 2) 최초 설정 (코딩 불필요)

1. 전원 인가 → **`GBSA0001`** AP 생성(PW `GBSA0001`), 상태 LED 1초 점멸
2. 폰으로 AP 접속 → 캡티브 포털 자동 표시(안 뜨면 `192.168.4.1`)
3. **WiFi 선택 + 비밀번호**, 그리고 **장치 이름 · 텔레그램 봇 토큰 · Chat ID** 입력
   - Chat ID를 비우면 봇에 `/start` 한 번으로 **자동 페어링**(FR-5.0.3)
4. 저장 → 자동 연결·재부팅 → 텔레그램으로 "설정 완료" 수신

자세한 절차: [docs/install.md](docs/install.md)

### 3) 웹 대시보드

```bash
cd web
cp .env.example .env.local      # Supabase/텔레그램 값 입력
npm install && npm run dev      # http://localhost:3000
vercel --prod                   # 배포
```

Supabase: `supabase/schema.sql`을 SQL Editor에 실행(테이블·RLS·미디어 버킷).

---

## 핵심 설계 결정 (요약)

| 주제 | 결정 | 근거 |
|---|---|---|
| 클라우드 접근 | **Push 모델** (장치→클라우드) | LAN 내 카메라 직접접근 불가, 포트포워딩 불필요 |
| 영상 포맷 | **MJPEG-AVI** | ESP32 H.264 HW 인코더 없음 |
| 원본 업로드 | **Supabase 서명 URL 직접 PUT** | Vercel 함수 바디/시간 한계 회피 |
| 감지 시각 | 파일명·메타·오버레이·캡션·클라우드 **5중 기록** | 제품 필수 요구(FR-4.7) |
| 태스크 모델 | **협조적 슈퍼루프**(카메라 접근 직렬화) | esp32-camera 프레임버퍼 동시접근 경합 회피 |

구현상 알려진 단순화(프리롤·TLS 핀닝 등)와 그 근거는
[docs/troubleshooting.md](docs/troubleshooting.md) 참조.

---

## 보안 주의

- **봇 토큰·device_key·Supabase service_role 키는 절대 커밋 금지**.
  `secrets.h`, `web/.env.local` 은 `.gitignore` 대상. 운영값은 **포털→NVS**가 정식 경로.
- 토큰이 노출됐다면 @BotFather `/revoke` 로 즉시 재발급 후 포털에서 갱신(R8).
