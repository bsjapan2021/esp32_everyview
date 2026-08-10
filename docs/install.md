# 설치 가이드

전 과정 CLI. macOS/Linux 기준.

## 0. 사전 도구

```bash
arduino-cli version && node -v && gh auth status
# (선택) vercel --version, esptool.py version
```

## 1. 펌웨어 빌드·플래시

```bash
cd firmware
cp esp32cam_guard/secrets.example.h esp32cam_guard/secrets.h   # 값은 비워도 됨(포털로 설정)

# (권장) 실제 플래시 용량 확인 — 4MB vs 8MB (FR-6.3.1)
esptool.py --port /dev/cu.usbserial-XXXX flash_id

# 컴파일 + 업로드
./build.sh /dev/cu.usbserial-XXXX
arduino-cli monitor -p /dev/cu.usbserial-XXXX -c baudrate=115200
```

> 8MB 클론이면 `partitions.csv`의 app1/coredump 오프셋을 8MB에 맞게 조정하거나
> `min_spiffs` 등 OTA 지원 스킴으로 빌드한다.

## 2. 텔레그램 봇 준비

1. @BotFather → `/newbot` → 봇 토큰 발급 (형식 `12345:AA...`)
2. 발급한 봇을 텔레그램에서 검색 → **`/start`** 전송
   - 이 단계를 거쳐야 봇이 사용자에게 먼저 메시지를 보낼 수 있다(R10).
3. Chat ID는 몰라도 됨 — 포털에서 비워두면 장치가 첫 `/start`로 **자동 페어링**(FR-5.0.3).
   - 수동 확인: `https://api.telegram.org/bot<TOKEN>/getUpdates` → `message.chat.id`

## 3. 최초 WiFi/텔레그램 설정 (캡티브 포털)

1. 장치 전원 인가 → **`GBSA0001`** AP 생성 (PW `GBSA0001`), 상태 LED 1초 점멸
2. 폰 WiFi 목록에서 `GBSA0001` 접속 → 포털 자동 표시(안 뜨면 `192.168.4.1`)
3. 입력:
   - **WiFi SSID / 비밀번호** (주변 AP 선택)
   - **장치 이름**, **텔레그램 봇 토큰**, (선택) **Chat ID**
   - (선택) 클라우드 URL, 민감도, 표준시(분, KST=540), 클립 길이
4. 저장 → 자동 연결·재부팅 → 텔레그램으로 "설정 완료·부팅 완료" 수신

재설정: 시리얼 `w`(포털)/`W`(초기화), 또는 부팅 시 GPIO0 접지(팩토리 리셋),
또는 대시보드/`POST /api/portal`.

## 4. Supabase (클라우드 저장)

1. supabase.com 프로젝트 생성
2. SQL Editor에 `supabase/schema.sql` 실행 (테이블 + RLS + `media` 비공개 버킷)
3. Project Settings → API 에서 URL / anon / service_role 키 확보

## 5. 웹 대시보드 (Vercel)

```bash
cd web
cp .env.example .env.local        # 아래 값 입력
npm install
npm run dev                       # http://localhost:3000

# 배포
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY     # 서버 전용, 클라이언트 노출 금지
vercel --prod
```

포털의 `cloud_url`을 배포된 도메인 `https://<app>.vercel.app/api/ingest`로 맞춘다.

## 6. OTA 릴리스

태그를 push하면 `.github/workflows/firmware.yml`이 빌드→Release 업로드+`manifest.json` 생성.

```bash
git tag v1.1.0 && git push origin v1.1.0
```

장치는 대시보드 버튼 / 텔레그램 `/ota` / 자동확인(기본 24h, 자동적용 OFF)으로 갱신.
