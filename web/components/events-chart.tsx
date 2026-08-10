"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HourBucket } from "@/lib/data";

/** 24-hour event histogram (KST). Client component (recharts). */
export function EventsChart({ data }: { data: HourBucket[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="w-full">
      <div className="mb-2 text-xs text-muted-foreground">
        최근 24시간 · 총 <span className="font-semibold text-foreground">{total}</span>건
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border)"
              vertical={false}
            />
            <XAxis
              dataKey="hour"
              tickFormatter={(h: number) => (h % 3 === 0 ? `${h}` : "")}
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
              axisLine={{ stroke: "var(--color-border)" }}
              tickLine={false}
              interval={0}
            />
            <YAxis
              allowDecimals={false}
              width={28}
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
              contentStyle={{
                background: "var(--color-card)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                color: "var(--color-foreground)",
                fontSize: 12,
              }}
              labelFormatter={(h) => `${h}시`}
              formatter={(value) => [`${value ?? 0}건`, "이벤트"]}
            />
            <Bar
              dataKey="count"
              fill="var(--color-primary)"
              radius={[4, 4, 0, 0]}
              maxBarSize={22}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
