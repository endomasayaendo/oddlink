import { APP_TIME_ZONE } from "@/lib/constants";

/** "Jan 2, 2026" in APP_TIME_ZONE, or "-" when there is no date. */
export function formatDate(date: Date | null): string {
  if (!date) return "-";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: APP_TIME_ZONE });
}
