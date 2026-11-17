"use client";

import {
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";

type Props = {
  data: Record<string, string | number>[];
  xKey: string;
  yKey: string;
  /** Accessible name of the chart: what it shows, ideally with a short summary of the numbers. */
  label: string;
  /** Formats a y value for the tooltip, e.g. 3 -> "3 clicks". Defaults to the bare number. */
  formatValue?: (value: number) => string;
  color?: string;
  height?: number;
};

// Colors come from the theme tokens (packages/tailwind-config/theme.css) as CSS variables.
const tick = { fontSize: 12, fill: "var(--color-ink-muted)" };
const axisLine = { stroke: "var(--color-ink)", strokeOpacity: 0.4 };

function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
}: Pick<TooltipContentProps, "active" | "payload" | "label"> & { formatValue: (value: number) => string }) {
  const value = payload?.[0]?.value;
  if (!active || typeof value !== "number") return null;
  return (
    <div
      style={{
        background: "var(--color-paper-light)",
        border: "2px solid var(--color-ink)",
        borderRadius: 8,
        fontFamily: "var(--font-sans)",
        color: "var(--color-ink)",
        padding: "6px 10px",
      }}
    >
      <p style={{ margin: 0 }}>{label}</p>
      <p style={{ margin: 0, fontWeight: 600 }}>{formatValue(value)}</p>
    </div>
  );
}

export function LineChart({
  data,
  xKey,
  yKey,
  label,
  formatValue = String,
  color = "var(--color-tomato-deep)",
  height = 300,
}: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      {/* An image named by `label`; it stays focusable so the arrow keys can step through the points. */}
      <RechartsLineChart data={data} role="img" aria-label={label}>
        <XAxis dataKey={xKey} tick={tick} axisLine={axisLine} tickLine={axisLine} />
        <YAxis allowDecimals={false} tick={tick} axisLine={axisLine} tickLine={axisLine} />
        <Tooltip
          content={({ active, payload, label: x }) => (
            <ChartTooltip active={active} payload={payload} label={x} formatValue={formatValue} />
          )}
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
