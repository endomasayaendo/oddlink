export type DailyClicks = { date: string; count: number };

/** 1 -> "1 click", 3 -> "3 clicks". */
export function clicksLabel(count: number): string {
  return `${count} ${count === 1 ? "click" : "clicks"}`;
}

/**
 * A one-sentence text alternative for the daily clicks chart: the date range, the total and the
 * busiest day (the earliest one on a tie). `days` is in date order and holds only days with clicks.
 */
export function summarizeDailyClicks(days: DailyClicks[]): string {
  if (days.length === 0) return "Daily clicks: no clicks yet.";
  const first = days[0]!;
  const last = days[days.length - 1]!;
  const total = days.reduce((sum, d) => sum + d.count, 0);
  if (days.length === 1) return `Daily clicks, ${first.date}: ${clicksLabel(total)}.`;
  const busiest = days.reduce((max, d) => (d.count > max.count ? d : max));
  return `Daily clicks, ${first.date} to ${last.date}: ${clicksLabel(total)} in total, most on ${busiest.date} (${clicksLabel(busiest.count)}).`;
}
