"use client";

import dynamic from "next/dynamic";
import { clicksLabel, type DailyClicks, summarizeDailyClicks } from "@/lib/analytics/daily-clicks";

const CHART_HEIGHT = 300;

// The charting library is large, so it sits in its own chunk that loads only when a chart renders.
const LineChart = dynamic(() => import("@oddlink/ui/charts").then((m) => m.LineChart), {
  // Holds the chart's space so the card doesn't jump when it arrives.
  loading: () => <div style={{ height: CHART_HEIGHT }} />,
});

/** Line chart of clicks per day, plus the same numbers as a table for screen readers. */
export function DailyClicksChart({ days }: { days: DailyClicks[] }) {
  return (
    <>
      <LineChart
        data={days}
        xKey="date"
        yKey="count"
        label={summarizeDailyClicks(days)}
        formatValue={clicksLabel}
        height={CHART_HEIGHT}
      />
      <table className="sr-only">
        <caption>Clicks per day</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Clicks</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d, i) => (
            // Labels have no year, so the same label can repeat across years.
            <tr key={`${i}-${d.date}`}>
              <th scope="row">{d.date}</th>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
