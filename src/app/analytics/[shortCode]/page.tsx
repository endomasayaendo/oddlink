import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { DailyChart } from "@/components/DailyChart";
import { getAnalytics } from "@/lib/analytics";
import { APP_TIME_ZONE } from "@/lib/config";

function formatDate(date: Date | null): string {
  if (!date) return "-";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: APP_TIME_ZONE });
}

// "2026-01-02" -> "Jan 2"; the date is already in APP_TIME_ZONE, so format it as UTC.
function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex-1 rounded-xl bg-[#f7f7f7] p-4 text-center">
      <p className="mb-1 text-xs text-[#666]">{label}</p>
      <p className="text-2xl font-bold text-ink">{value}</p>
    </div>
  );
}

export default function AnalyticsPage({ params }: PageProps<"/analytics/[shortCode]">) {
  return (
    <main className="mx-auto max-w-[720px] px-4 py-6 sm:p-8">
      <div className="mb-8 text-center">
        <Link href="/" className="text-brand-gradient text-2xl font-bold hover:no-underline sm:text-[2rem]">
          OddLink
        </Link>
      </div>
      {/* Analytics are live data, so they stream in behind the static header. */}
      <Suspense fallback={<p className="py-16 text-center text-[#666]">Loading...</p>}>
        <AnalyticsContent params={params} />
      </Suspense>
    </main>
  );
}

async function AnalyticsContent({ params }: Pick<PageProps<"/analytics/[shortCode]">, "params">) {
  const { shortCode } = await params;
  const data = await getAnalytics(shortCode);
  if (!data) notFound();

  const chartData = data.dailyAccess.map((d) => ({ date: formatDay(d.date), count: d.count }));

  return (
    <>
      <div className="mb-8 text-center">
        <a
          href={data.shortUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-2 block text-lg font-semibold break-all text-brand"
        >
          {data.shortUrl}
        </a>
        <a
          href={data.originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-[0.8rem] break-all text-[#999]"
        >
          {data.originalUrl}
        </a>
      </div>

      <div className="mb-8 flex flex-col gap-4 sm:flex-row">
        <StatCard label="Total Clicks" value={data.totalAccessCount} />
        <StatCard label="Created" value={formatDate(data.createdAt)} />
        <StatCard label="Expires" value={formatDate(data.expiresAt)} />
      </div>

      <div className="mb-8 rounded-xl bg-[#f7f7f7] p-4 sm:p-6">
        <p className="mb-4 font-semibold text-ink">Daily Clicks</p>
        {chartData.length > 0 ? (
          <DailyChart data={chartData} />
        ) : (
          <p className="py-8 text-center text-[#666]">No access data yet</p>
        )}
      </div>
    </>
  );
}
