import { sql, type SQL } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAnalytics } from "@/lib/analytics/get-analytics";
import { db } from "@/lib/db";
import { urlMappings } from "@/lib/db/schema";
import { getLinkPreview } from "@/lib/links/get-link-preview";
import { getLinkState, type LinkActor } from "@/lib/links/link-state";
import { resolveShortCode } from "@/lib/links/resolve-link";
import { rewriteGone } from "@/lib/middleware/utils/rewrite-gone";
import { NOT_FOUND_CACHE_CONTROL } from "@/lib/middleware/utils/rewrite-not-found";
import { proxy } from "@/proxy";
import { resetUrlTables } from "../utils/reset-db";

/**
 * Every reader of url_mappings against one row in every state (ADR 0002, M4). A new reader goes
 * into `Reader` (and the registry test's allowlist); a new state into `Fixture`. Both are keys of
 * `expected`, so forgetting a cell is a type error.
 */

vi.mock(import("@/lib/middleware/utils/rewrite-gone"), async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, rewriteGone: vi.fn(original.rewriteGone) };
});

resetUrlTables();
beforeEach(() => {
  vi.mocked(rewriteGone).mockClear();
});

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
  | "proxy /c"
  | "proxy /c+"
  | "proxy /preview/c"
  | "proxy /analytics/c"
  | "getLinkState"
  | "getAnalytics"
  | "getLinkPreview";

// Proxy outcomes: "gone" means rewriteGone answered (#76 turns it into a 410; today it is the 404).
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
  "proxy /c": live("redirect", "not-found", "gone"),
  "proxy /c+": live("preview", "preview", "gone"),
  "proxy /preview/c": live("pass", "pass", "gone"),
  "proxy /analytics/c": live("pass", "pass", "gone"),
  getLinkState: byState,
  getAnalytics: byState,
  getLinkPreview: byState,
};

async function viaProxy(path: string, notFoundPage: string): Promise<{ outcome: Outcome; seen: string }> {
  const res = await proxy(new NextRequest(`http://localhost:3000${path}`));
  const rewrite = res.headers.get("x-middleware-rewrite");
  const seen = JSON.stringify([...res.headers]) + (await res.text());
  if (vi.mocked(rewriteGone).mock.calls.length > 0) {
    // No visible change yet: a gone link looks exactly like an unknown one.
    expect(rewrite).toBe(`http://localhost:3000${notFoundPage}`);
    expect(res.headers.get("cache-control")).toBe(NOT_FOUND_CACHE_CONTROL);
    return { outcome: "gone", seen };
  }
  if (res.status === 302) return { outcome: "redirect", seen };
  if (rewrite === `http://localhost:3000${notFoundPage}`) return { outcome: "not-found", seen };
  if (rewrite === `http://localhost:3000/preview/${CODE}`) return { outcome: "preview", seen };
  if (res.headers.get("x-middleware-next") === "1") return { outcome: "pass", seen };
  throw new Error(`unexpected proxy response ${res.status} ${seen}`);
}

const run: Record<Reader, () => Promise<{ outcome: Outcome; seen: string }>> = {
  resolveShortCode: async () => {
    const link = await resolveShortCode(CODE);
    return { outcome: link ? "hit" : "miss", seen: JSON.stringify(link) };
  },
  "proxy /c": () => viaProxy(`/${CODE}`, "/not-found"),
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

// Where a disabled or deleted link may still show its destination: only analytics, and only for
// the owner's own disable (ADR 0002, HTTP behaviour).
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
    if (result.outcome === "gone") {
      const [, status] = vi.mocked(rewriteGone).mock.calls[0];
      expect(status.state).toBe(fixture.startsWith("deleted") ? "deleted" : "disabled");
    }
  });
});
