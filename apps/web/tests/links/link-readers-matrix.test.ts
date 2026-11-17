import { eq, sql, type SQL } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAnalytics } from "@/lib/analytics/get-analytics";
import { db } from "@/lib/db";
import { accessLog, urlMappings } from "@/lib/db/schema";
import { getLinkPreview } from "@/lib/links/get-link-preview";
import { getLinkState, type LinkActor } from "@/lib/links/link-state";
import { type GoneVariant } from "@/lib/links/gone";
import { serveGone } from "@/lib/middleware/utils/serve-gone";
import { NO_STORE_CACHE_CONTROL, NOT_FOUND_CACHE_CONTROL } from "@/lib/middleware/utils/rewrite-not-found";
import { findActiveLink, resolveShortCode } from "@/lib/links/resolve-link";
import { proxy } from "@/proxy";
import { resetUrlTables } from "../utils/reset-db";
import { stubGonePages } from "../utils/stub-gone-page";

/**
 * Every reader of url_mappings against one row in every state. A new reader goes
 * into `Reader` (and the registry test's allowlist); a new state into `Fixture`. Both are keys of
 * `expected`, so forgetting a cell is a type error.
 */

vi.mock(import("@/lib/middleware/utils/serve-gone"), async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, serveGone: vi.fn(original.serveGone) };
});

resetUrlTables();
beforeEach(() => {
  vi.mocked(serveGone).mockClear();
  stubGonePages();
});
afterEach(() => vi.restoreAllMocks());

const CODE = "matrix-code";
const DESTINATION = "https://destination.example/secret-path";
const past = () => new Date(Date.now() - 86_400_000);
const future = () => new Date(Date.now() + 86_400_000);
const disabledBy = (by: LinkActor) => sql`disabled_at = now(), disabled_by = ${by}`;
const deletedBy = (by: LinkActor) => sql`original_url = NULL, access_count = 0, deleted_at = now(), deleted_by = ${by}`;

const fixtures = {
  active: { expiresAt: future() },
  "no-expiry": { expiresAt: null },
  expired: { expiresAt: past() },
  "disabled-operator": { expiresAt: future(), set: disabledBy("operator") },
  "disabled-automated": { expiresAt: future(), set: disabledBy("automated") },
  "disabled-owner": { expiresAt: future(), set: disabledBy("owner") },
  "disabled-expired": { expiresAt: past(), set: disabledBy("operator") },
  "deleted-operator": { expiresAt: future(), set: deletedBy("operator") },
  "deleted-owner": { expiresAt: future(), set: deletedBy("owner") },
} satisfies Record<string, { expiresAt: Date | null; set?: SQL }>;
type Fixture = keyof typeof fixtures;

type Reader =
  | "resolveShortCode"
  | "findActiveLink"
  | "proxy /c"
  | "proxy HEAD /c"
  | "proxy /c+"
  | "proxy /preview/c"
  | "proxy /analytics/c"
  | "getLinkState"
  | "getAnalytics"
  | "getLinkPreview";

// Proxy outcomes: "gone" means serveGone answered with the 410 gone page.
type Outcome = "hit" | "miss" | "redirect" | "not-found" | "preview" | "pass" | "gone" | "active" | "expired" | "disabled" | "deleted";

const live = (a: Outcome, b: Outcome, gone: Outcome) =>
  ({
    active: a,
    "no-expiry": a,
    expired: b,
    "disabled-operator": gone,
    "disabled-automated": gone,
    "disabled-owner": gone,
    "disabled-expired": gone,
    "deleted-operator": gone,
    "deleted-owner": gone,
  }) satisfies Record<Fixture, Outcome>;

const byState = {
  ...live("active", "expired", "disabled"),
  "deleted-operator": "deleted",
  "deleted-owner": "deleted",
} satisfies Record<Fixture, Outcome>;

const expected: Record<Reader, Record<Fixture, Outcome>> = {
  resolveShortCode: live("hit", "miss", "miss"),
  findActiveLink: live("hit", "miss", "miss"),
  "proxy /c": live("redirect", "not-found", "gone"),
  "proxy HEAD /c": live("redirect", "not-found", "gone"),
  "proxy /c+": live("preview", "preview", "gone"),
  "proxy /preview/c": live("pass", "pass", "gone"),
  // A disabled link keeps its analytics page (with a banner); only a tombstone is gone.
  "proxy /analytics/c": {
    ...live("pass", "pass", "pass"),
    "deleted-operator": "gone",
    "deleted-owner": "gone",
  },
  getLinkState: byState,
  getAnalytics: byState,
  getLinkPreview: byState,
};

async function viaProxy(path: string, notFoundPage: string, method = "GET"): Promise<{ outcome: Outcome; seen: string }> {
  const res = await proxy(new NextRequest(`http://localhost:3000${path}`, { method }));
  const rewrite = res.headers.get("x-middleware-rewrite");
  const seen = JSON.stringify([...res.headers]) + (await res.text());
  if (vi.mocked(serveGone).mock.calls.length > 0) {
    expect(res.status).toBe(410);
    expect(rewrite).toBeNull();
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe(NO_STORE_CACHE_CONTROL);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    return { outcome: "gone", seen };
  }
  if (res.status === 302) return { outcome: "redirect", seen };
  if (rewrite === `http://localhost:3000${notFoundPage}`) {
    expect(res.headers.get("cache-control")).toBe(NOT_FOUND_CACHE_CONTROL);
    return { outcome: "not-found", seen };
  }
  if (rewrite === `http://localhost:3000/preview/${CODE}`) return { outcome: "preview", seen };
  if (res.headers.get("x-middleware-next") === "1") return { outcome: "pass", seen };
  throw new Error(`unexpected proxy response ${res.status} ${seen}`);
}

const run: Record<Reader, () => Promise<{ outcome: Outcome; seen: string }>> = {
  resolveShortCode: async () => {
    const link = await resolveShortCode(CODE);
    return { outcome: link ? "hit" : "miss", seen: JSON.stringify(link) };
  },
  findActiveLink: async () => {
    const link = await findActiveLink(CODE);
    return { outcome: link ? "hit" : "miss", seen: JSON.stringify(link) };
  },
  "proxy /c": () => viaProxy(`/${CODE}`, "/not-found"),
  "proxy HEAD /c": () => viaProxy(`/${CODE}`, "/not-found", "HEAD"),
  "proxy /c+": () => viaProxy(`/${CODE}+`, "/not-found"),
  "proxy /preview/c": () => viaProxy(`/preview/${CODE}`, "/not-found"),
  "proxy /analytics/c": () => viaProxy(`/analytics/${CODE}`, "/analytics/not-found"),
  getLinkState: async () => {
    const status = await getLinkState(CODE);
    return { outcome: status!.state, seen: JSON.stringify(status) };
  },
  getAnalytics: async () => {
    const analytics = await getAnalytics(CODE);
    return { outcome: analytics!.state, seen: JSON.stringify(analytics) };
  },
  getLinkPreview: async () => {
    const preview = await getLinkPreview(CODE);
    return { outcome: preview!.state, seen: JSON.stringify(preview) };
  },
};

// The wording each gone fixture gets: a generic reason unless the owner acted.
const goneVariants: Partial<Record<Fixture, GoneVariant>> = {
  "disabled-operator": "disabled-flagged",
  "disabled-automated": "disabled-flagged",
  "disabled-owner": "disabled",
  "disabled-expired": "disabled-flagged",
  "deleted-operator": "deleted-flagged",
  "deleted-owner": "deleted",
};
// The only readers that count a click and write an access log row.
const counts = (reader: Reader) => reader === "resolveShortCode" || reader === "proxy /c";

// Where a disabled or deleted link may still show its destination: only analytics, and only for
// the owner's own disable.
const mayShowDestination = (reader: Reader, fixture: Fixture) => reader === "getAnalytics" && fixture === "disabled-owner";

const cases = (Object.keys(expected) as Reader[]).flatMap((reader) =>
  (Object.keys(fixtures) as Fixture[]).map((fixture) => [reader, fixture, expected[reader][fixture]] as const),
);

describe("link readers × link states", () => {
  it.each(cases)("%s on %s → %s", async (reader, fixture, outcome) => {
    const { expiresAt, set } = fixtures[fixture] as { expiresAt: Date | null; set?: SQL };
    await db.insert(urlMappings).values({ shortCode: CODE, originalUrl: DESTINATION, expiresAt });
    if (set) await db.execute(sql`UPDATE url_mappings SET ${set} WHERE short_code = ${CODE}`);

    const result = await run[reader]();
    expect(result.outcome).toBe(outcome);

    const live = fixture === "active" || fixture === "no-expiry" || fixture === "expired";
    if (!live && !mayShowDestination(reader, fixture)) {
      expect(result.seen).not.toContain("destination.example");
    }
    if (!live || !counts(reader)) {
      // Disabled and deleted: no count, no log, whichever reader ran; any state for a non-counting reader.
      const [row] = await db.select({ count: urlMappings.accessCount }).from(urlMappings).where(eq(urlMappings.shortCode, CODE));
      expect(row.count).toBe(0);
      expect(await db.$count(accessLog)).toBe(0);
    }
    if (result.outcome === "gone") {
      const [status] = vi.mocked(serveGone).mock.calls[0];
      expect(status.state).toBe(fixture.startsWith("deleted") ? "deleted" : "disabled");
      expect(result.seen).toContain(`gone page http://localhost:3000/gone/${goneVariants[fixture]}<`);
    }
  });
});
