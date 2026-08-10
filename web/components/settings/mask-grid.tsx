"use client";

import { cn } from "@/lib/utils";

export const MASK_COLS = 8;
export const MASK_ROWS = 6;
export const MASK_CELLS = MASK_COLS * MASK_ROWS; // 48

/**
 * Convert the 48-cell boolean array to a hex bitmask string (bit 0 = cell 0).
 * Computed as two 24-bit halves to stay within safe 32-bit bitwise ops
 * (avoids BigInt / target constraints).
 */
export function maskToHex(cells: boolean[]): string {
  let low = 0; // bits 0..23
  let high = 0; // bits 24..47
  for (let i = 0; i < 24; i++) {
    if (cells[i]) low |= 1 << i;
    if (cells[i + 24]) high |= 1 << i;
  }
  const hex =
    (high >>> 0).toString(16).padStart(6, "0") +
    (low >>> 0).toString(16).padStart(6, "0");
  return `0x${hex}`;
}

export function MaskGrid({
  cells,
  onChange,
}: {
  cells: boolean[];
  onChange: (next: boolean[]) => void;
}) {
  function toggle(i: number) {
    const next = cells.slice();
    next[i] = !next[i];
    onChange(next);
  }

  const activeCount = cells.filter(Boolean).length;

  return (
    <div>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${MASK_COLS}, minmax(0, 1fr))` }}
        role="group"
        aria-label="감지 영역 마스크 (8×6)"
      >
        {Array.from({ length: MASK_CELLS }).map((_, i) => {
          const active = cells[i] ?? false;
          const row = Math.floor(i / MASK_COLS) + 1;
          const col = (i % MASK_COLS) + 1;
          return (
            <button
              key={i}
              type="button"
              onClick={() => toggle(i)}
              aria-pressed={active}
              aria-label={`${row}행 ${col}열 ${active ? "활성" : "비활성"}`}
              className={cn(
                "aspect-square rounded-md border text-[10px] font-medium transition-colors",
                active
                  ? "border-primary/50 bg-primary/70 text-primary-foreground"
                  : "border-border bg-muted hover:bg-muted/60",
              )}
            />
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => onChange(new Array(MASK_CELLS).fill(true))}
          className="rounded-lg border border-border bg-muted px-2.5 py-1 hover:bg-muted/70"
        >
          전체 선택
        </button>
        <button
          type="button"
          onClick={() => onChange(new Array(MASK_CELLS).fill(false))}
          className="rounded-lg border border-border bg-muted px-2.5 py-1 hover:bg-muted/70"
        >
          전체 해제
        </button>
        <button
          type="button"
          onClick={() => onChange(cells.map((c) => !c))}
          className="rounded-lg border border-border bg-muted px-2.5 py-1 hover:bg-muted/70"
        >
          반전
        </button>
        <span className="ml-auto text-muted-foreground">
          활성 {activeCount}/{MASK_CELLS} ·{" "}
          <span className="font-mono">{maskToHex(cells)}</span>
        </span>
      </div>
    </div>
  );
}
