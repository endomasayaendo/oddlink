import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { shortUrlFor } from "@/lib/constants";
import { formatDate } from "@/lib/format-date";
import { describeTarget } from "@/lib/links/describe-target";
import { getLinkPreview } from "@/lib/links/get-link-preview";
import { StatCard } from "@/ui/analytics/stat-card";

// A preview is for the person holding the link, not for search results. Static and generic on
// purpose: the code and destination are read in the Suspense boundary below.
export const metadata: Metadata = {
  title: "Link preview - OddLink",
  robots: { index: false, follow: false },
};

export default function PreviewPage({ params }: PageProps<"/preview/[shortCode]">) {
  return (
    <main className="mx-auto max-w-[720px] px-4 py-6 sm:p-8">
      <div className="mb-8 text-center">
        <Link href="/" className="text-brand-gradient text-2xl font-bold hover:no-underline sm:text-[2rem]">
          OddLink
        </Link>
      </div>
      {/* The link is live data, so it streams in behind the static header. */}
      <Suspense fallback={<p className="py-16 text-center text-[#666]">Loading...</p>}>
        <PreviewContent params={params} />
      </Suspense>
    </main>
  );
}

async function PreviewContent({ params }: Pick<PageProps<"/preview/[shortCode]">, "params">) {
  const { shortCode } = await params;
  const data = await getLinkPreview(shortCode);
  if (!data) notFound();

  const { host, insecure } = describeTarget(data.target);
  const encodedCode = encodeURIComponent(data.shortCode);

  return (
    <>
      <div className="mb-8 text-center">
        <p className="mb-2 text-xs tracking-wide text-[#666] uppercase">Link preview</p>
        <h1 className="mb-1 text-lg font-semibold break-all text-brand">{data.shortCode}</h1>
        <p className="text-[0.8rem] break-all text-[#999]">{shortUrlFor(data.shortCode)}</p>
      </div>

      <div className="mb-8 rounded-xl bg-[#f7f7f7] p-4 sm:p-6">
        <p className="mb-1 text-xs text-[#666]">This link goes to</p>
        <p className="mb-4 text-2xl font-bold break-all text-ink sm:text-3xl">{host}</p>
        <p className="mb-1 text-xs text-[#666]">Full address (not a link, so you can read it before you go)</p>
        <code className="block rounded-lg bg-white p-3 text-sm break-all text-ink select-all">{data.target.href}</code>
        {insecure && (
          <p className="mt-3 text-sm text-[#8a5a00]">This address starts with http://, so the connection is not encrypted.</p>
        )}
      </div>

      {data.expired && data.expiresAt && (
        <div role="status" className="mb-8 rounded-xl bg-[#fff4e0] p-4 text-center font-semibold text-[#8a5a00]">
          Expired on {formatDate(data.expiresAt)}. This link no longer redirects.
        </div>
      )}

      <div className="mb-8 flex flex-col gap-4 sm:flex-row">
        <StatCard label="Total Clicks" value={data.accessCount} />
        <StatCard label="Created" value={formatDate(data.createdAt)} />
        <StatCard label="Expires" value={formatDate(data.expiresAt)} />
      </div>

      <div className="flex flex-col items-center gap-4">
        {!data.expired && (
          // The short link itself, not the destination: the click is counted and every redirect check applies.
          // A plain <a> on purpose: next/link would prefetch it, and a redirect isn't a page.
          <a
            href={`/${encodedCode}`}
            className="bg-brand-gradient inline-block rounded-lg px-6 py-3 font-semibold text-white transition hover:-translate-y-px hover:no-underline hover:opacity-90"
          >
            Continue to destination
          </a>
        )}
        <Link href={`/analytics/${encodedCode}`} className="text-sm text-brand">
          View analytics
        </Link>
        <p className="text-center text-xs text-[#999]">Viewing this preview does not count as a click.</p>
      </div>
    </>
  );
}
