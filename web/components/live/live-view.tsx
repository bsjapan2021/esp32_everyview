"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Video,
  Camera,
  Zap,
  ZapOff,
  Wifi,
  WifiOff,
  TriangleAlert,
  Play,
  Square,
  RotateCcw,
} from "lucide-react";
import { Card, GuidanceCard } from "@/components/ui";
import { cn } from "@/lib/utils";

const RESOLUTIONS: { label: string; val: number }[] = [
  { label: "VGA 640×480", val: 8 },
  { label: "SVGA 800×600", val: 9 },
  { label: "XGA 1024×768", val: 10 },
  { label: "HD 1280×720", val: 11 },
  { label: "UXGA 1600×1200", val: 13 },
];

type ConnState = "idle" | "connecting" | "connected" | "error";

export function LiveView() {
  const [ip, setIp] = useState("");
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [state, setState] = useState<ConnState>("idle");
  const [flashOn, setFlashOn] = useState(false);
  const [resolution, setResolution] = useState(11);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = localStorage.getItem("live-device-ip");
        if (saved) setIp(saved);
      } catch {
        /* ignore */
      }
    });
  }, []);

  const base = ip.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");

  const connect = useCallback(() => {
    if (!base) return;
    try {
      localStorage.setItem("live-device-ip", base);
    } catch {
      /* ignore */
    }
    setState("connecting");
    setSnapshot(null);
    // Cache-bust so a re-connect actually re-requests the stream.
    setStreamUrl(`http://${base}:81/stream?t=${Date.now()}`);
  }, [base]);

  const disconnect = useCallback(() => {
    setStreamUrl(null);
    setState("idle");
  }, []);

  const sendControl = useCallback(
    async (variable: string, value: number) => {
      if (!base) return;
      try {
        await fetch(`http://${base}/control?var=${variable}&val=${value}`, {
          mode: "no-cors",
        });
      } catch {
        /* best-effort; LAN-only */
      }
    },
    [base],
  );

  const toggleFlash = useCallback(() => {
    const next = !flashOn;
    setFlashOn(next);
    void sendControl("flash", next ? 1 : 0);
  }, [flashOn, sendControl]);

  const changeResolution = useCallback(
    (val: number) => {
      setResolution(val);
      void sendControl("framesize", val);
    },
    [sendControl],
  );

  const takeSnapshot = useCallback(() => {
    if (!base) return;
    setSnapshot(`http://${base}/capture?t=${Date.now()}`);
  }, [base]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Stream */}
      <div className="lg:col-span-2">
        <Card className="overflow-hidden">
          <div className="relative aspect-video w-full bg-black">
            {streamUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                ref={imgRef}
                src={streamUrl}
                alt={`${base} 라이브 MJPEG 스트림`}
                className="h-full w-full object-contain"
                onLoad={() => setState("connected")}
                onError={() => setState("error")}
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <Video className="h-10 w-10" aria-hidden />
                <p className="text-sm">디바이스 IP를 입력하고 연결하세요</p>
              </div>
            )}

            {/* connection state chip */}
            <div className="absolute left-2 top-2">
              <ConnChip state={state} />
            </div>

            {state === "connected" ? (
              <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-danger/90 px-2 py-0.5 text-xs font-semibold text-white">
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                LIVE
              </div>
            ) : null}
          </div>
        </Card>

        {state === "error" ? (
          <div className="mt-4">
            <GuidanceCard
              title="연결에 실패했습니다"
              tone="danger"
              icon={<TriangleAlert className="h-5 w-5 text-danger" />}
            >
              <ul className="ml-4 list-disc space-y-1">
                <li>
                  라이브 뷰는 <strong>같은 로컬 네트워크(LAN)</strong>에서만
                  동작합니다. 클라우드(인터넷)에서는 디바이스의 사설 IP에 직접
                  접근할 수 없습니다.
                </li>
                <li>
                  브라우저와 ESP32-CAM이 동일한 Wi-Fi에 연결되어 있는지
                  확인하세요.
                </li>
                <li>
                  IP 주소와 포트가 올바른지 확인하세요. (스트림 포트는 보통{" "}
                  <code className="font-mono">81</code>)
                </li>
                <li>
                  HTTPS 페이지에서 HTTP 스트림을 불러오면{" "}
                  <em>혼합 콘텐츠(mixed content)</em>가 차단될 수 있습니다. 로컬
                  개발(http://localhost) 환경에서 사용하세요.
                </li>
              </ul>
            </GuidanceCard>
          </div>
        ) : (
          <div className="mt-4">
            <GuidanceCard
              title="LAN 직결 스트리밍"
              tone="info"
              icon={<Wifi className="h-5 w-5 text-primary" />}
            >
              이 화면은 브라우저에서 ESP32-CAM으로 직접 연결하는 MJPEG
              스트림입니다. 감지 이벤트/썸네일은 클라우드에 저장되지만, 실시간
              영상은 대역폭 절약을 위해 디바이스와 같은 네트워크에서만
              재생됩니다.
            </GuidanceCard>
          </div>
        )}

        {snapshot ? (
          <div className="mt-4">
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between p-3">
                <p className="text-sm font-medium">스냅샷</p>
                <button
                  type="button"
                  onClick={() => setSnapshot(null)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  닫기
                </button>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={snapshot}
                alt="스냅샷"
                className="w-full"
                onError={() => setSnapshot(null)}
              />
            </Card>
          </div>
        ) : null}
      </div>

      {/* Controls */}
      <div>
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
            연결
          </h2>
          <label htmlFor="ip" className="mb-1 block text-xs text-muted-foreground">
            디바이스 IP 주소
          </label>
          <input
            id="ip"
            type="text"
            inputMode="decimal"
            placeholder="192.168.0.42"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            className="w-full rounded-lg border border-border bg-input px-3 py-2 font-mono text-sm outline-none focus:border-primary"
          />

          <div className="mt-3 flex gap-2">
            {streamUrl ? (
              <>
                <button
                  type="button"
                  onClick={disconnect}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-2 text-sm font-medium hover:bg-muted/70"
                >
                  <Square className="h-4 w-4" aria-hidden /> 중지
                </button>
                <button
                  type="button"
                  onClick={connect}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-2 text-sm font-medium hover:bg-muted/70"
                  aria-label="다시 연결"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={connect}
                disabled={!base}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <Play className="h-4 w-4" aria-hidden /> 연결
              </button>
            )}
          </div>

          <div className="my-4 h-px bg-border" />

          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
            카메라 제어
          </h2>

          <button
            type="button"
            onClick={takeSnapshot}
            disabled={!base}
            className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-2 text-sm font-medium hover:bg-muted/70 disabled:opacity-50"
          >
            <Camera className="h-4 w-4" aria-hidden /> 스냅샷 촬영
          </button>

          <button
            type="button"
            onClick={toggleFlash}
            disabled={!base}
            aria-pressed={flashOn}
            className={cn(
              "mb-3 flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50",
              flashOn
                ? "border-warning/40 bg-warning/15 text-warning"
                : "border-border bg-muted hover:bg-muted/70",
            )}
          >
            {flashOn ? (
              <Zap className="h-4 w-4" aria-hidden />
            ) : (
              <ZapOff className="h-4 w-4" aria-hidden />
            )}
            플래시 {flashOn ? "켜짐" : "꺼짐"}
          </button>

          <label
            htmlFor="res"
            className="mb-1 block text-xs text-muted-foreground"
          >
            해상도
          </label>
          <select
            id="res"
            value={resolution}
            onChange={(e) => changeResolution(Number(e.target.value))}
            disabled={!base}
            className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
          >
            {RESOLUTIONS.map((r) => (
              <option key={r.val} value={r.val}>
                {r.label}
              </option>
            ))}
          </select>
        </Card>
      </div>
    </div>
  );
}

function ConnChip({ state }: { state: ConnState }) {
  const map: Record<
    ConnState,
    { label: string; className: string; icon: React.ReactNode }
  > = {
    idle: {
      label: "대기",
      className: "bg-black/60 text-white/80",
      icon: <WifiOff className="h-3.5 w-3.5" aria-hidden />,
    },
    connecting: {
      label: "연결 중…",
      className: "bg-warning/90 text-white",
      icon: <Wifi className="h-3.5 w-3.5 animate-pulse" aria-hidden />,
    },
    connected: {
      label: "연결됨",
      className: "bg-success/90 text-white",
      icon: <Wifi className="h-3.5 w-3.5" aria-hidden />,
    },
    error: {
      label: "연결 실패",
      className: "bg-danger/90 text-white",
      icon: <WifiOff className="h-3.5 w-3.5" aria-hidden />,
    },
  };
  const s = map[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        s.className,
      )}
    >
      {s.icon}
      {s.label}
    </span>
  );
}
