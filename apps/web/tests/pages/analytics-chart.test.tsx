import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AnalyticsPage from "@/app/analytics/[shortCode]/page";
import { db } from "@/lib/db";
import { accessLog, urlMappings } from "@/lib/db/schema";
import { resetUrlTables } from "../utils/reset-db";

resetUrlTables();

type ContentProps = { params: Promise<{ shortCode: string }> };

/** Renders the streamed part of the analytics page (the async component inside its Suspense boundary). */
async function renderContent(shortCode: string): Promise<string> {
  const params = Promise.resolve({ shortCode });
  const find = (node: ReactNode): { type: (props: ContentProps) => Promise<ReactNode>; props: ContentProps } | null => {
    if (!isValidElement<{ children?: ReactNode } & Partial<ContentProps>>(node)) return null;
    if (typeof node.type === "function" && node.props.params) return node as never;
    for (const child of [node.props.children].flat()) {
      const found = find(child);
      if (found) return found;
    }
    return null;
  };
  const content = find(AnalyticsPage({ params, searchParams: Promise.resolve({}) } as never));
  if (!content) throw new Error("no content element");
  return renderToStaticMarkup(await content.type(content.props));
}

describe("analytics page daily clicks", () => {
  it("shows the empty state and no chart for a link with no clicks", async () => {
    await db.insert(urlMappings).values({ shortCode: "quiet-link", originalUrl: "https://example.com/q" });
    const html = await renderContent("quiet-link");
    expect(html).toContain("No access data yet");
    expect(html).not.toContain("Clicks per day");
  });

  it("lists the clicks per day in a table for screen readers", async () => {
    const [link] = await db
      .insert(urlMappings)
      .values({ shortCode: "busy-link", originalUrl: "https://example.com/b", accessCount: 3 })
      .returning();
    await db.insert(accessLog).values([
      // 10:00 in Asia/Tokyo, so each lands on the same calendar day in APP_TIME_ZONE.
      { urlMappingId: link!.id, accessedAt: new Date("2026-11-04T01:00:00Z") },
      { urlMappingId: link!.id, accessedAt: new Date("2026-11-05T01:00:00Z") },
      { urlMappingId: link!.id, accessedAt: new Date("2026-11-05T02:00:00Z") },
    ]);
    const html = await renderContent("busy-link");
    expect(html).not.toContain("No access data yet");
    expect(html).toContain('<table class="sr-only"><caption>Clicks per day</caption>');
    expect(html).toContain('<th scope="row">Nov 4</th><td>1</td>');
    expect(html).toContain('<th scope="row">Nov 5</th><td>2</td>');
  });
});
