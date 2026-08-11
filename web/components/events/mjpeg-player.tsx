"use client";

/**
 * MJPEG-AVI 플레이어.
 *
 * ESP32-CAM 기기는 5초 클립을 MJPEG-AVI(각 프레임이 완결된 JPEG인 RIFF 컨테이너)로
 * 저장한다. 브라우저 <video>는 AVI를 재생하지 못하므로, 서명 URL로 파일을 받아
 * JPEG 프레임 경계(FFD8…FFD9)를 스캔해 추출하고 canvas에 순차 렌더링해 재생한다.
 *
 * - 재생 전에는 스냅샷(poster)만 보여주고, 재생 버튼을 눌러야 파일을 내려받는다
 *   (상세 페이지 로드마다 수 MB를 받지 않도록).
 * - 파싱 실패 시 다운로드 안내로 폴백.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Loader2, Video, AlertTriangle } from "lucide-react";

interface MjpegPlayerProps {
  src: string;
  poster?: string | null;
  fps?: number;
  className?: string;
}

type Phase = "idle" | "loading" | "ready" | "error";

/** MJPEG 바이트 스트림에서 개별 JPEG 프레임(FFD8…FFD9) 구간을 추출한다. */
function extractJpegFrames(bytes: Uint8Array): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let i = 0;
  const n = bytes.length;
  while (i < n - 1) {
    // SOI 탐색
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8) {
      const start = i;
      i += 2;
      // EOI 탐색
      while (i < n - 1 && !(bytes[i] === 0xff && bytes[i + 1] === 0xd9)) i++;
      if (i < n - 1) {
        ranges.push([start, i + 2]); // EOI 포함
        i += 2;
        continue;
      }
      break; // EOI 미발견 → 마지막 불완전 프레임 폐기
    }
    i++;
  }
  return ranges;
}

export function MjpegPlayer({
  src,
  poster,
  fps = 10,
  className,
}: MjpegPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const framesRef = useRef<ImageBitmap[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idxRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [playing, setPlaying] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [current, setCurrent] = useState(0);
  const [errMsg, setErrMsg] = useState("");

  const drawFrame = useCallback((idx: number) => {
    const canvas = canvasRef.current;
    const frames = framesRef.current;
    if (!canvas || !frames[idx]) return;
    const bmp = frames[idx];
    if (canvas.width !== bmp.width) canvas.width = bmp.width;
    if (canvas.height !== bmp.height) canvas.height = bmp.height;
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(bmp, 0, 0);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    const interval = Math.max(33, Math.round(1000 / fps));
    timerRef.current = setInterval(() => {
      const frames = framesRef.current;
      if (!frames.length) return;
      let next = idxRef.current + 1;
      if (next >= frames.length) next = 0; // 반복 재생
      idxRef.current = next;
      setCurrent(next);
      drawFrame(next);
    }, interval);
  }, [drawFrame, fps, stopTimer]);

  const load = useCallback(async () => {
    setPhase("loading");
    setErrMsg("");
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`다운로드 실패 (HTTP ${res.status})`);
      const buf = new Uint8Array(await res.arrayBuffer());
      const ranges = extractJpegFrames(buf);
      if (ranges.length === 0) throw new Error("영상 프레임을 찾을 수 없습니다.");

      const bitmaps: ImageBitmap[] = [];
      for (const [s, e] of ranges) {
        const blob = new Blob([buf.slice(s, e)], { type: "image/jpeg" });
        try {
          bitmaps.push(await createImageBitmap(blob));
        } catch {
          /* 손상 프레임 건너뜀 */
        }
      }
      if (bitmaps.length === 0) throw new Error("프레임 디코딩에 실패했습니다.");

      framesRef.current = bitmaps;
      setFrameCount(bitmaps.length);
      idxRef.current = 0;
      setCurrent(0);
      setPhase("ready");
      drawFrame(0);
      setPlaying(true);
      startTimer();
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "영상을 불러오지 못했습니다.");
      setPhase("error");
    }
  }, [src, drawFrame, startTimer]);

  const togglePlay = useCallback(() => {
    if (phase === "idle" || phase === "error") {
      void load();
      return;
    }
    if (playing) {
      stopTimer();
      setPlaying(false);
    } else {
      startTimer();
      setPlaying(true);
    }
  }, [phase, playing, load, startTimer, stopTimer]);

  const seek = useCallback(
    (idx: number) => {
      idxRef.current = idx;
      setCurrent(idx);
      drawFrame(idx);
    },
    [drawFrame],
  );

  // 언마운트 정리
  useEffect(() => {
    return () => {
      stopTimer();
      framesRef.current.forEach((b) => b.close?.());
      framesRef.current = [];
    };
  }, [stopTimer]);

  const durationSec = frameCount ? (frameCount / fps).toFixed(1) : "0";
  const posSec = frameCount ? (current / fps).toFixed(1) : "0.0";

  return (
    <div className={className}>
      <div className="relative bg-black">
        {/* 재생 전: 스냅샷 포스터 */}
        {phase === "idle" && poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster}
            alt="클립 미리보기"
            className="max-h-[60vh] w-full object-contain opacity-90"
          />
        ) : (
          <canvas
            ref={canvasRef}
            className="max-h-[60vh] w-full object-contain"
            aria-label="감지 클립 영상"
          />
        )}

        {/* 중앙 오버레이(대기/로딩/에러/일시정지) */}
        {phase !== "ready" || !playing ? (
          <button
            type="button"
            onClick={togglePlay}
            disabled={phase === "loading"}
            className="absolute inset-0 flex items-center justify-center transition hover:bg-black/20"
            aria-label={playing ? "일시정지" : "재생"}
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
              {phase === "loading" ? (
                <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
              ) : phase === "error" ? (
                <AlertTriangle className="h-7 w-7 text-warning" aria-hidden />
              ) : (
                <Play className="ml-1 h-7 w-7" aria-hidden />
              )}
            </span>
          </button>
        ) : null}
      </div>

      {/* 컨트롤 바 */}
      <div className="flex items-center gap-3 p-3 text-sm">
        <button
          type="button"
          onClick={togglePlay}
          disabled={phase === "loading"}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border hover:bg-muted disabled:opacity-50"
          aria-label={playing ? "일시정지" : "재생"}
        >
          {phase === "loading" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : playing ? (
            <Pause className="h-4 w-4" aria-hidden />
          ) : (
            <Play className="ml-0.5 h-4 w-4" aria-hidden />
          )}
        </button>

        <input
          type="range"
          min={0}
          max={Math.max(0, frameCount - 1)}
          value={current}
          onChange={(e) => seek(Number(e.target.value))}
          disabled={phase !== "ready"}
          className="h-1.5 flex-1 cursor-pointer accent-primary disabled:opacity-40"
          aria-label="재생 위치"
        />

        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {posSec}s / {durationSec}s
        </span>

        <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
          <Video className="h-3.5 w-3.5" aria-hidden />
          {frameCount ? `${frameCount}f` : "MJPEG"}
        </span>
      </div>

      {phase === "error" ? (
        <p className="px-3 pb-3 text-xs text-warning">
          {errMsg} — 아래 “클립 저장”으로 내려받아 재생할 수 있습니다.
        </p>
      ) : null}
    </div>
  );
}
