"use client";

import { Line, LineChart as RechartsLineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Props = {
  data: Record<string, string | number>[];
  xKey: string;
  yKey: string;
  color?: string;
  height?: number;
};

// Colors come from the theme tokens (packages/tailwind-config/theme.css) as CSS variables.
const tick = { fontSize: 12, fill: "var(--color-ink-muted)" };
const axisLine = { stroke: "var(--color-ink)", strokeOpacity: 0.4 };

export function LineChart({ data, xKey, yKey, color = "var(--color-tomato-deep)", height = 300 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart data={data}>
        <XAxis dataKey={xKey} tick={tick} axisLine={axisLine} tickLine={axisLine} />
        <YAxis allowDecimals={false} tick={tick} axisLine={axisLine} tickLine={axisLine} />
        <Tooltip
          contentStyle={{
            background: "var(--color-paper-light)",
            border: "2px solid var(--color-ink)",
            borderRadius: 8,
            fontFamily: "var(--font-sans)",
          }}
          labelStyle={{ color: "var(--color-ink)" }}
          itemStyle={{ color: "var(--color-ink)" }}
          cursor={axisLine}
        />
        <Line
          type="monotone"
          dataKey={yKey}
          stroke={color}
          strokeWidth={2}
          // A light fill with a colored ring keeps each point visible against the paper.
          dot={{ fill: "var(--color-paper-light)", stroke: color, strokeWidth: 2, r: 4 }}
          activeDot={{ fill: color, stroke: "var(--color-paper-light)", r: 6 }}
        />
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}
