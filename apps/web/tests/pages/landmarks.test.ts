import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prerenderToNodeStream } from "react-dom/static";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AnalyticsNotFound from "@/app/analytics/not-found";
import { metadata as analyticsNotFoundMetadata } from "@/app/analytics/not-found/page";
import AnalyticsPage, { metadata as analyticsMetadata } from "@/app/analytics/[shortCode]/page";
import Error from "@/app/error";
import GlobalError from "@/app/global-error";
import DeletedPage, { metadata as deletedMetadata } from "@/app/gone/deleted/page";
import DisabledPage, { metadata as disabledMetadata } from "@/app/gone/disabled/page";
import NotFound, { metadata as notFoundMetadata } from "@/app/not-found";
import LinkNotFound from "@/app/not-found/not-found";
import { metadata as linkNotFoundMetadata } from "@/app/not-found/page";
import type { Analytics } from "@/lib/analytics/get-analytics";

vi.mock("@/app/fonts", () => ({ fontVariables: "" }));
vi.mock("@/lib/analytics/get-analytics", () => ({ getAnalytics: vi.fn() }));
// The chart measures the DOM, which a server render doesn't have.
vi.mock("@oddlink/ui/charts", () => ({ LineChart: () => null }));

const { getAnalytics } = await import("@/lib/analytics/get-analytics");

const count = (html: string, pattern: RegExp) => html.match(new RegExp(pattern, "g"))?.length ?? 0;

// Renders async server components too, waiting for every Suspense boundary to resolve.
async function renderAll(element: ReactElement): Promise<string> {
  const { prelude } = await prerenderToNodeStream(element);
  let html = "";
  for await (const chunk of prelude) html += chunk;
  return html;
}

function expectLandmarks(html: string, h1: string) {
  expect(count(html, /<main[\s>]/)).toBe(1);
  expect(count(html, /<h1[\s>]/)).toBe(1);
  const escaped = h1.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  expect(html).toMatch(new RegExp(`<h1[^>]*>(?:<[^>]+>)*${escaped}`));
}

describe("not-found and gone pages", () => {
  it.each([
    ["root 404", NotFound, notFoundMetadata, "Page not found", "Page not found - OddLink"],
    ["link 404", LinkNotFound, linkNotFoundMetadata, "This link doesn&#x27;t exist or has expired.", "Link not found - OddLink"],
    ["analytics 404", AnalyticsNotFound, analyticsNotFoundMetadata, "Short code not found", "Short code not found - OddLink"],
    ["deleted 410", DeletedPage, deletedMetadata, "This link was deleted.", "Link gone - OddLink"],
    ["disabled 410", DisabledPage, disabledMetadata, "This link was disabled.", "Link gone - OddLink"],
  ])("%s has one main, one h1 and its own title", (_, Page, metadata, h1, title) => {
    expectLandmarks(renderToStaticMarkup(createElement(Page)), h1);
    expect(metadata.title).toBe(title);
  });
});

describe("error pages", () => {
  const props = { error: new globalThis.Error("boom"), retry: () => {} };

  it("error boundary has one main, one h1 and a title", () => {
    const html = renderToStaticMarkup(createElement(Error, props));
    expectLandmarks(html, "Something went wrong. Please try again.");
    expect(html).toContain("<title>Something went wrong - OddLink</title>");
  });

  it("global error has one main, one h1 and exactly one title", () => {
    const html = renderToStaticMarkup(createElement(GlobalError, props));
    expectLandmarks(html, "Something went wrong. Please try again.");
    expect(count(html, /<title>/)).toBe(1);
  });
});

describe("analytics page", () => {
  const params = Promise.resolve({ shortCode: "odd-code" });
  const base = {
    shortCode: "odd-code",
    shortUrl: "http://localhost:3000/odd-code",
    totalAccessCount: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    expiresAt: null,
    dailyAccess: [],
  };

  beforeEach(() => vi.mocked(getAnalytics).mockReset());

  // Static, so it is part of the prerendered shell and never names the code or destination.
  it("has a static title", () => {
    expect(analyticsMetadata.title).toBe("Link analytics - OddLink");
  });

  it("has one main and the short URL as its h1", async () => {
    vi.mocked(getAnalytics).mockResolvedValue({
      ...base,
      state: "active",
      originalUrl: "https://example.com",
      originalHref: "https://example.com/",
    } as Analytics);
    const html = await renderAll(createElement(AnalyticsPage, { params, searchParams: Promise.resolve({}) }));
    expectLandmarks(html, "http://localhost:3000/odd-code");
  });

});
