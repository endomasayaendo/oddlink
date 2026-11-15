import { eq, sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { accessLog, urlMappings } from "@/lib/db/schema";
import { issueShortUrl } from "@/lib/links/issue-link";
import { type ControlResult, deleteLink, disableLink, enableLink, type Principal } from "@/lib/links/link-control";
import { type LinkActor, linkState } from "@/lib/links/link-state";
import { redirectStatement } from "@/lib/links/resolve-link";
import { resetUrlTables } from "../utils/reset-db";

resetUrlTables();
afterEach(() => {
  vi.restoreAllMocks();
});

const CODE = "control-code";
const BYSTANDER = "bystander-code";
const URL_ = "https://destination.example/path";
const LOGS = 2;
const STAMP = new Date("2026-01-01T00:00:00Z");
const past = () => new Date(Date.now() - 86_400_000);
const future = () => new Date(Date.now() + 86_400_000);
const disabledBy = (by: LinkActor) => sql`disabled_at = ${STAMP.toISOString()}, disabled_by = ${by}`;

const fixtures = {
  missing: null,
  active: { expiresAt: future() },
  expired: { expiresAt: past() },
  "disabled-owner": { expiresAt: future(), set: disabledBy("owner") },
  "disabled-automated": { expiresAt: future(), set: disabledBy("automated") },
  "disabled-operator": { expiresAt: future(), set: disabledBy("operator") },
  // Deleted by the owner, so a second delete by the operator visibly does not re-stamp it.
  deleted: {
    expiresAt: future(),
    set: sql`original_url = NULL, access_count = 0, deleted_at = ${STAMP.toISOString()}, deleted_by = 'owner'`,
  },
} satisfies Record<string, { expiresAt: Date; set?: SQL } | null>;
type Fixture = keyof typeof fixtures;

async function insertLink(shortCode: string, fixture: { expiresAt: Date; set?: SQL }) {
  const [{ id }] = await db
    .insert(urlMappings)
    .values({ shortCode, originalUrl: URL_, expiresAt: fixture.expiresAt, accessCount: LOGS })
    .returning({ id: urlMappings.id });
  await db.insert(accessLog).values(Array.from({ length: LOGS }, () => ({ urlMappingId: id })));
  if (fixture.set) {
    // A tombstone never keeps logs; the rest keep theirs.
    if (fixture === fixtures.deleted) await db.delete(accessLog).where(eq(accessLog.urlMappingId, id));
    await db.execute(sql`UPDATE url_mappings SET ${fixture.set} WHERE id = ${id}`);
  }
}

async function setup(fixture: Fixture) {
  await insertLink(BYSTANDER, { expiresAt: future() });
  const f = fixtures[fixture];
  if (f) await insertLink(CODE, f);
}

/** The resulting row, summarized: state with its actor, whether the data survived, and the stamp. */
type Row = "active" | "expired" | `disabled:${LinkActor}` | `deleted:${LinkActor}`;

async function readRow(shortCode: string) {
  const [row] = await db
    .select({
      id: urlMappings.id,
      state: linkState,
      disabledBy: urlMappings.disabledBy,
      disabledAt: urlMappings.disabledAt,
      deletedBy: urlMappings.deletedBy,
      deletedAt: urlMappings.deletedAt,
      originalUrl: urlMappings.originalUrl,
      accessCount: urlMappings.accessCount,
    })
    .from(urlMappings)
    .where(eq(urlMappings.shortCode, shortCode));
  if (!row) return null;
  const [{ logs }] = await db
    .select({ logs: sql<number>`count(*)::int` })
    .from(accessLog)
    .where(eq(accessLog.urlMappingId, row.id));
  const summary: Row =
    row.state === "disabled" ? `disabled:${row.disabledBy!}` : row.state === "deleted" ? `deleted:${row.deletedBy!}` : row.state;
  return { ...row, logs, summary };
}

async function expectRow(expected: Row | null, { restamped }: { restamped: boolean }) {
  const row = await readRow(CODE);
  if (expected === null) return expect(row).toBeNull();
  expect(row?.summary).toBe(expected);
  if (expected.startsWith("deleted")) {
    // Tombstone: short_code kept, data gone, no disable left behind.
    expect(row).toMatchObject({ originalUrl: null, accessCount: 0, logs: 0, disabledAt: null, disabledBy: null });
  } else {
    expect(row).toMatchObject({ originalUrl: URL_, accessCount: LOGS, logs: LOGS });
  }
  const stamp = expected.startsWith("deleted") ? row!.deletedAt : row!.disabledAt;
  if (stamp) expect(stamp.getTime() !== STAMP.getTime()).toBe(restamped);
}

async function expectInvariants() {
  // The five CHECKs from ADR 0002, re-evaluated over every row after the operation.
  const [{ violations }] = await db.execute<{ violations: number }>(sql`
    SELECT count(*)::int AS violations FROM url_mappings WHERE NOT (
      ((disabled_at IS NULL) = (disabled_by IS NULL))
      AND ((deleted_at IS NULL) = (deleted_by IS NULL))
      AND (deleted_by IS NULL OR deleted_by <> 'automated')
      AND (deleted_at IS NOT NULL OR original_url IS NOT NULL)
      AND (deleted_at IS NULL OR original_url IS NULL)
    )
  `).then((r) => r.rows);
  expect(violations).toBe(0);
  // Another link's data is never touched.
  expect(await readRow(BYSTANDER)).toMatchObject({ summary: "active", originalUrl: URL_, accessCount: LOGS, logs: LOGS });
}

const ok = (changed: boolean): ControlResult => ({ ok: true, changed });
const fail = (reason: "not_found" | "deleted" | "not_allowed"): ControlResult => ({ ok: false, reason });

type Expected = [ControlResult, Row | null];
type Case = { op: "disable" | "enable" | "delete"; actor: "operator" | "automated"; cases: Record<Fixture, Expected> };

const DELETED: Expected = [fail("deleted"), "deleted:owner"];
const MISSING: Expected = [fail("not_found"), null];

const table: Case[] = [
  {
    op: "disable",
    actor: "operator",
    cases: {
      missing: MISSING,
      active: [ok(true), "disabled:operator"],
      expired: [ok(true), "disabled:operator"],
      "disabled-owner": [ok(true), "disabled:operator"],
      "disabled-automated": [ok(true), "disabled:operator"],
      "disabled-operator": [ok(false), "disabled:operator"],
      deleted: DELETED,
    },
  },
  {
    op: "disable",
    actor: "automated",
    cases: {
      missing: MISSING,
      active: [ok(true), "disabled:automated"],
      expired: [ok(true), "disabled:automated"],
      "disabled-owner": [ok(true), "disabled:automated"],
      "disabled-automated": [ok(false), "disabled:automated"],
      "disabled-operator": [ok(false), "disabled:operator"],
      deleted: DELETED,
    },
  },
  {
    op: "enable",
    actor: "operator",
    cases: {
      missing: MISSING,
      active: [ok(false), "active"],
      expired: [ok(false), "expired"],
      "disabled-owner": [ok(true), "active"],
      "disabled-automated": [ok(true), "active"],
      "disabled-operator": [ok(true), "active"],
      deleted: DELETED,
    },
  },
  {
    op: "enable",
    actor: "automated",
    cases: {
      missing: MISSING,
      active: [ok(false), "active"],
      expired: [ok(false), "expired"],
      "disabled-owner": [fail("not_allowed"), "disabled:owner"],
      "disabled-automated": [fail("not_allowed"), "disabled:automated"],
      "disabled-operator": [fail("not_allowed"), "disabled:operator"],
      deleted: DELETED,
    },
  },
  {
    op: "delete",
    actor: "operator",
    cases: {
      missing: MISSING,
      active: [ok(true), "deleted:operator"],
      expired: [ok(true), "deleted:operator"],
      "disabled-owner": [ok(true), "deleted:operator"],
      "disabled-automated": [ok(true), "deleted:operator"],
      "disabled-operator": [ok(true), "deleted:operator"],
      deleted: [ok(false), "deleted:owner"],
    },
  },
];

function run(op: Case["op"], actor: Case["actor"], shortCode = CODE): Promise<ControlResult> {
  if (op === "disable") return disableLink(shortCode, { actor });
  if (op === "enable") return enableLink(shortCode, { actor });
  if (actor === "automated") throw new Error("automated cannot delete");
  return deleteLink(shortCode, { actor });
}

describe("link-control rules", () => {
  const rows = table.flatMap(({ op, actor, cases }) =>
    Object.entries(cases).map(([fixture, [result, row]]) => ({ op, actor, fixture: fixture as Fixture, result, row })),
  );

  it.each(rows)("$actor $op on $fixture → $result.ok $row", async ({ op, actor, fixture, result, row }) => {
    await setup(fixture);
    expect(await run(op, actor)).toEqual(result);
    await expectRow(row, { restamped: result.ok && result.changed });
    await expectInvariants();
  });

  it.each(rows)("$actor $op on $fixture is idempotent", async ({ op, actor, fixture, row }) => {
    await setup(fixture);
    await run(op, actor);
    const first = await readRow(CODE);
    const again = await run(op, actor);
    // A repeat changes nothing; failures repeat with the same reason.
    if (again.ok) expect(again).toEqual(ok(false));
    else expect(again).toEqual((table.find((c) => c.op === op && c.actor === actor)!.cases[fixture] as Expected)[0]);
    expect(await readRow(CODE)).toEqual(first);
    expect(first?.summary ?? null).toBe(row);
    await expectInvariants();
  });
});

describe("owner principal (ADR 0002 Phase 2)", () => {
  const owner: Principal = { actor: "owner", userId: "user-1" };

  it.each([
    ["disable", disableLink],
    ["enable", enableLink],
    ["delete", deleteLink],
  ] as const)("%s throws before touching the database", async (_, fn) => {
    await setup("active");
    const execute = vi.spyOn(db, "execute");
    const transaction = vi.spyOn(db, "transaction");
    await expect(fn(CODE, owner as Extract<Principal, { actor: "owner" }>)).rejects.toThrow("owner control is ADR 0002 Phase 2");
    expect(execute).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("deleteLink does not accept the automated actor", () => {
    // Type-level only (the CHECK deleted_by_not_automated also forbids it); never called.
    const never = () =>
      // @ts-expect-error automation never deletes
      deleteLink(CODE, { actor: "automated" });
    expect(never).toBeTypeOf("function");
  });
});

describe("deleteLink tombstone", () => {
  it("removes only that link's logs and keeps its short_code", async () => {
    await setup("active");
    expect(await deleteLink(CODE, { actor: "operator" })).toEqual(ok(true));
    const row = await readRow(CODE);
    expect(row).toMatchObject({ summary: "deleted:operator", originalUrl: null, accessCount: 0, logs: 0 });
    const [{ orphans }] = await db
      .select({ orphans: sql<number>`count(*)::int` })
      .from(accessLog)
      .where(eq(accessLog.urlMappingId, row!.id));
    expect(orphans).toBe(0);
    await expectInvariants();
  });

  it("is never issued again: issuing skips the tombstoned phrase", async () => {
    await setup("active");
    await deleteLink(CODE, { actor: "operator" });
    const before = await readRow(CODE);
    const generate = vi.fn<() => Promise<string>>().mockResolvedValueOnce(CODE).mockResolvedValueOnce("fresh-code");
    const result = await issueShortUrl("https://someone-else.example/", {
      generate,
      checkUrl: async () => "safe",
      rateLimit: async () => ({ allowed: true }),
    });
    expect(result).toMatchObject({ ok: true, shortCode: "fresh-code" });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(await readRow(CODE)).toEqual(before);
  });

  it("leaves no orphan logs when a redirect commits while the delete waits for the row lock", async () => {
    await setup("active");
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      const redirect = drizzle(client);
      await redirect.execute(sql`BEGIN`);
      const { rows } = await redirect.execute(redirectStatement(CODE));
      expect(rows).toHaveLength(1);

      const deleting = deleteLink(CODE, { actor: "operator" });
      await waitForLockWait(await backendPid(client));
      // The redirect's log row commits only now, after the delete's snapshot would have been taken.
      await redirect.execute(sql`COMMIT`);
      expect(await deleting).toEqual(ok(true));
    } finally {
      await client.end();
    }

    const row = await readRow(CODE);
    expect(row).toMatchObject({ summary: "deleted:operator", originalUrl: null, accessCount: 0, logs: 0 });
    const [{ orphans }] = await db
      .select({ orphans: sql<number>`count(*)::int` })
      .from(accessLog)
      .where(eq(accessLog.urlMappingId, row!.id));
    expect(orphans).toBe(0);
    await expectInvariants();
  });
});

describe("disable/enable racing a concurrent state change", () => {
  // Another transaction changes the row and commits while the control statement waits for its lock.
  // The result must describe the row version the statement locked, never the stale one in its start
  // snapshot (a stale row that fails the WHERE is skipped without EvalPlanQual re-checking it).
  type Race = { name: string; fixture: Fixture; concurrent: SQL; op: () => Promise<ControlResult>; expected: Expected };
  const enable = sql`disabled_at = NULL, disabled_by = NULL`;
  const races: Race[] = [
    {
      name: "operator disable while an enable commits",
      fixture: "disabled-operator",
      concurrent: enable,
      op: () => disableLink(CODE, { actor: "operator" }),
      expected: [ok(true), "disabled:operator"],
    },
    {
      name: "automated disable while an enable of the operator's disable commits",
      fixture: "disabled-operator",
      concurrent: enable,
      op: () => disableLink(CODE, { actor: "automated" }),
      expected: [ok(true), "disabled:automated"],
    },
    {
      name: "automated disable while an operator disable commits",
      fixture: "active",
      concurrent: sql`disabled_at = now(), disabled_by = 'operator'`,
      op: () => disableLink(CODE, { actor: "automated" }),
      expected: [ok(false), "disabled:operator"],
    },
    {
      name: "operator enable while an automated disable commits",
      fixture: "active",
      concurrent: sql`disabled_at = now(), disabled_by = 'automated'`,
      op: () => enableLink(CODE, { actor: "operator" }),
      expected: [ok(true), "active"],
    },
    {
      name: "operator disable while a delete commits",
      fixture: "active",
      concurrent: sql`original_url = NULL, access_count = 0, deleted_at = now(), deleted_by = 'operator'`,
      op: () => disableLink(CODE, { actor: "operator" }),
      expected: [fail("deleted"), "deleted:operator"],
    },
  ];

  it.each(races)("$name", async ({ fixture, concurrent, op, expected: [result, row] }) => {
    await setup(fixture);
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      const other = drizzle(client);
      await other.execute(sql`BEGIN`);
      if (row?.startsWith("deleted")) {
        await other.execute(sql`DELETE FROM access_log WHERE url_mapping_id IN (SELECT id FROM url_mappings WHERE short_code = ${CODE})`);
      }
      await other.execute(sql`UPDATE url_mappings SET ${concurrent} WHERE short_code = ${CODE}`);
      const pending = op();
      await waitForLockWait(await backendPid(client));
      await other.execute(sql`COMMIT`);
      expect(await pending).toEqual(result);
    } finally {
      await client.end();
    }
    expect((await readRow(CODE))?.summary).toBe(row);
    await expectInvariants();
  });
});

/** Waits until a backend is blocked on a lock held by `blockerPid` (the statement under test). */
async function waitForLockWait(blockerPid: number) {
  for (let i = 0; i < 200; i++) {
    const { rows } = await db.execute<{ waiting: number }>(
      sql`SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE ${blockerPid}::int = ANY(pg_blocking_pids(pid))`,
    );
    if (rows[0].waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("no backend started waiting for the lock");
}

async function backendPid(client: Client): Promise<number> {
  const { rows } = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
  return rows[0].pid;
}
