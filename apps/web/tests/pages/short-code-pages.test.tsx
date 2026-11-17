import { describe, expect, it } from "vitest";
import AnalyticsPage from "@/app/analytics/[shortCode]/page";
import PreviewPage from "@/app/preview/[shortCode]/page";
import { db } from "@/lib/db";
import { urlMappings } from "@/lib/db/schema";
import { findContent, NOT_FOUND, type Page, renderPage } from "../utils/render-page";
import { resetUrlTables } from "../utils/reset-db";

resetUrlTables();

const pages: [string, Page, string][] = [
  ["analytics", AnalyticsPage as Page, "/analytics/[shortCode]"],
  ["preview", PreviewPage as Page, "/preview/[shortCode]"],
];

describe.each(pages)("%s page", (name, page, route) => {
  const path = (segment: string) => `/${name}/${segment}`;

  it("shows a non-ASCII code", async () => {
    await db.insert(urlMappings).values({ shortCode: "ねこ-🐱", originalUrl: "https://example.com/cat" });
    const html = await renderPage(page, route, path(encodeURIComponent("ねこ-🐱")));
    expect(html).toContain("https://example.com/cat");
  });

  it("shows an ASCII code", async () => {
    await db.insert(urlMappings).values({ shortCode: "golden-clock-whispers", originalUrl: "https://example.com/a" });
    const html = await renderPage(page, route, path("golden-clock-whispers"));
    expect(html).toContain("https://example.com/a");
  });

  it("decodes a literal % only once", async () => {
    await db.insert(urlMappings).values([
      { shortCode: "50%-off", originalUrl: "https://example.com/percent" },
      { shortCode: "50%25-off", originalUrl: "https://example.com/encoded" },
    ]);
    expect(await renderPage(page, route, path("50%25-off"))).toContain("https://example.com/percent");
    expect(await renderPage(page, route, path("50%2525-off"))).toContain("https://example.com/encoded");
  });

  it("answers a malformed escape with notFound()", async () => {
    const content = findContent(page({ params: Promise.resolve({ shortCode: "%E3%81" }), searchParams: Promise.resolve({}) }));
    await expect(content.type(content.props)).rejects.toMatchObject(NOT_FOUND);
  });

  it("answers an unknown code with notFound()", async () => {
    await expect(renderPage(page, route, path(encodeURIComponent("いぬ")))).rejects.toMatchObject(NOT_FOUND);
  });
});
