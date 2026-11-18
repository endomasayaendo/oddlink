import { describe, expect, it } from "vitest";
import AnalyticsPage from "@/app/analytics/[shortCode]/page";
import PreviewPage from "@/app/preview/[shortCode]/page";
import { db } from "@/lib/db";
import { accessLog, urlMappings } from "@/lib/db/schema";
import { FLAGGED_REASON } from "@/lib/links/gone";
import { type Anchor, anchorsOf, NOT_FOUND, type Page, renderPage, textOf } from "../utils/render-page";
import { resetUrlTables } from "../utils/reset-db";

resetUrlTables();

const CODE = "golden-clock-whispers";
const SHORT_URL = `http://localhost:3000/${CODE}`;
const DESTINATION = "https://example.com/destination";

// 23:30 UTC on Jan 1 is already Jan 2 in APP_TIME_ZONE (Asia/Tokyo in tests).
const CREATED_AT = new Date("2026-01-01T23:30:00Z");
const PAST_EXPIRY = new Date("2020-03-31T15:30:00Z"); // Apr 1, 2020 in Tokyo
const FUTURE_EXPIRY = new Date("2099-12-31T15:30:00Z"); // Jan 1, 2100 in Tokyo

const insertLink = (values: Partial<typeof urlMappings.$inferInsert> = {}) =>
  db
    .insert(urlMappings)
    .values({ shortCode: CODE, originalUrl: DESTINATION, createdAt: CREATED_AT, accessCount: 4271, ...values })
    .returning()
    .then((rows) => rows[0]);

const preview = () => renderPage(PreviewPage as Page, "/preview/[shortCode]", `/preview/${CODE}`);
const analytics = () => renderPage(AnalyticsPage as Page, "/analytics/[shortCode]", `/analytics/${CODE}`);

const linkTo = (html: string, href: string): Anchor | undefined => anchorsOf(html).find((a) => a.attrs.href === href);
const relTokens = (anchor: Anchor | undefined) => (anchor?.attrs.rel ?? "").split(/\s+/);
const continueButton = (html: string) => anchorsOf(html).find((a) => /continue to destination/i.test(a.text));

describe("preview page content", () => {
  it("offers to continue through the short link while the link is active", async () => {
    await insertLink({ expiresAt: FUTURE_EXPIRY });
    const html = await preview();

    expect(continueButton(html)?.attrs.href).toBe(`/${CODE}`);
    expect(textOf(html)).not.toMatch(/expired on/i);
  });

  it("shows the expiry banner and no way to continue once the link has expired", async () => {
    await insertLink({ expiresAt: PAST_EXPIRY });
    const html = await preview();

    expect(textOf(html)).toMatch(/Expired on Apr 1, 2020\..*no longer redirects/);
    expect(continueButton(html)).toBeUndefined();
    expect(anchorsOf(html).some((a) => a.attrs.href === `/${CODE}`)).toBe(false);
  });

  it("warns that an http:// destination is not encrypted", async () => {
    await insertLink({ originalUrl: "http://example.com/plain" });
    expect(textOf(await preview())).toMatch(/starts with http:\/\/.*not encrypted/);
  });

  it("does not warn about an https:// destination", async () => {
    await insertLink();
    expect(textOf(await preview())).not.toMatch(/not encrypted/);
  });

  it("shows the click count and the dates in APP_TIME_ZONE", async () => {
    await insertLink({ expiresAt: FUTURE_EXPIRY });
    const text = textOf(await preview());

    expect(text).toMatch(/Total Clicks 4271\b/);
    expect(text).toMatch(/Created Jan 2, 2026\b/);
    expect(text).toMatch(/Expires Jan 1, 2100\b/);
  });

  it('shows "-" for a link that never expires', async () => {
    await insertLink();
    expect(textOf(await preview())).toMatch(/Expires - /);
  });

  it("answers a disabled link with notFound()", async () => {
    await insertLink({ disabledAt: new Date(), disabledBy: "owner" });
    await expect(preview()).rejects.toMatchObject(NOT_FOUND);
  });
});

describe("analytics page content", () => {
  it("links to the short URL and the destination in a new tab without an opener or referrer", async () => {
    await insertLink();
    const html = await analytics();

    for (const href of [SHORT_URL, DESTINATION]) {
      const anchor = linkTo(html, href);
      expect(anchor, href).toBeDefined();
      expect(anchor?.attrs.target).toBe("_blank");
      expect(relTokens(anchor)).toEqual(expect.arrayContaining(["noopener", "noreferrer"]));
    }
  });

  it("shows no disabled banner for an active link", async () => {
    await insertLink();
    expect(textOf(await analytics())).not.toMatch(/disabled/i);
  });

  it("hides the destination and gives the reason when someone other than the owner disabled the link", async () => {
    await insertLink({ disabledAt: new Date(), disabledBy: "operator" });
    const html = await analytics();

    expect(textOf(html)).toContain(`This link is disabled ${FLAGGED_REASON}. It no longer redirects.`);
    expect(html).not.toContain(DESTINATION);
    // The short URL is the only outbound link; nothing else opens a new tab.
    expect(anchorsOf(html).filter((a) => a.attrs.target === "_blank").map((a) => a.attrs.href)).toEqual([SHORT_URL]);
  });

  it("keeps the destination and gives no reason when the owner disabled the link", async () => {
    await insertLink({ disabledAt: new Date(), disabledBy: "owner" });
    const html = await analytics();
    const text = textOf(html);

    expect(text).toContain("This link is disabled. It no longer redirects.");
    expect(text).not.toContain(FLAGGED_REASON);
    expect(relTokens(linkTo(html, DESTINATION))).toEqual(expect.arrayContaining(["noopener", "noreferrer"]));
  });

  it("shows the click count and the dates in APP_TIME_ZONE", async () => {
    await insertLink({ expiresAt: FUTURE_EXPIRY });
    const text = textOf(await analytics());

    expect(text).toMatch(/Total Clicks 4271\b/);
    expect(text).toMatch(/Created Jan 2, 2026\b/);
    expect(text).toMatch(/Expires Jan 1, 2100\b/);
  });

  it("says there is no access data when nobody has clicked", async () => {
    await insertLink({ accessCount: 0 });
    expect(textOf(await analytics())).toContain("No access data yet");
  });

  it("draws the chart instead once there are clicks", async () => {
    const link = await insertLink({ accessCount: 1 });
    await db.insert(accessLog).values({ urlMappingId: link.id, accessedAt: CREATED_AT });
    expect(textOf(await analytics())).not.toContain("No access data yet");
  });
});
