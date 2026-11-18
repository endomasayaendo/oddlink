import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getAnalytics } from "@/lib/analytics/get-analytics";
import { formatDate } from "@/lib/format-date";
import { shortCodeFromParams } from "@/lib/links/short-code-param";
import { FLAGGED_REASON, isFlagged } from "@/lib/links/gone";
import { DailyClicksChart } from "@/ui/analytics/daily-clicks-chart";
import { StatCard } from "@/ui/analytics/stat-card";

// "2026-01-02" -> "Jan 2"; the date is already in APP_TIME_ZONE, so format it as UTC.
function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// Analytics are for the person holding the link, not for search results. Static, so the robots
// meta is part of the prerendered shell whatever the lookup below finds.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AnalyticsPage({ params }: PageProps<"/analytics/[shortCode]">) {
  return (
    <main className="mx-auto max-w-[720px] px-4 py-6 sm:p-8">
      <div className="mb-8 text-center">
        <Link href="/" className="font-display text-2xl font-semibold text-tomato hover:no-underline sm:text-[2rem]">
          OddLink
        </Link>
      </div>
      {/* Analytics are live data, so they stream in behind the static header. */}
      <Suspense fallback={<p className="py-16 text-center text-ink-muted">Loading...</p>}>
        <AnalyticsContent params={params} />
      </Suspense>
    </main>
  );
}

async function AnalyticsContent({ params }: Pick<PageProps<"/analytics/[shortCode]">, "params">) {
  const shortCode = await shortCodeFromParams(params);
  const data = await getAnalytics(shortCode);
  // The proxy answers deleted links before this page runs.
  if (!data || data.state === "deleted") notFound();

  const chartData = data.dailyAccess.map((d) => ({ date: formatDay(d.date), count: d.count }));

  return (
    <>
      <div className="mb-8 text-center">
        <a
          href={data.shortUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-2 block text-lg font-semibold break-all text-tomato-deep"
        >
          {data.shortUrl}
        </a>
        {/* Null when the link was disabled by anyone but its owner: the destination stays hidden. */}
        {data.originalUrl !== null && (
          <a
            href={data.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-[0.8rem] break-all text-ink-muted"
          >
            {data.originalUrl}
          </a>
        )}
      </div>

      {data.state === "disabled" && (
        <div role="status" className="mb-8 rounded-wobble border-2 border-rust bg-rust-wash p-4 text-center font-semibold text-rust">
          {isFlagged(data.disabledBy)
            ? `This link is disabled ${FLAGGED_REASON}. It no longer redirects.`
            : "This link is disabled. It no longer redirects."}
        </div>
      )}

      <div className="mb-8 flex flex-col gap-4 sm:flex-row">
        <StatCard label="Total Clicks" value={data.totalAccessCount} />
        <StatCard label="Created" value={formatDate(data.createdAt)} />
        <StatCard label="Expires" value={formatDate(data.expiresAt)} />
      </div>

      {/* The odd touch here: every other offset shadow falls down and to the right; this one
          is cast up and to the left, toward a light that isn't there. */}
      <div className="mb-8 rounded-wobble border-2 border-ink bg-paper-light p-4 shadow-[-4px_-4px_0_var(--color-ink-strong)] sm:p-6">
        <p className="mb-4 font-display font-semibold text-ink">Daily Clicks</p>
        {/* No chart (and none of its code) for a link nobody has clicked yet. */}
        {chartData.length > 0 ? (
          <DailyClicksChart days={chartData} />
        ) : (
          <p className="py-8 text-center text-ink-muted">No access data yet</p>
        )}
      </div>
    </>
  );
}
