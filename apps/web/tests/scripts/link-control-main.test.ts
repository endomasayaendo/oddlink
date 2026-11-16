import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { accessLog, urlMappings } from "@/lib/db/schema";
import { linkState } from "@/lib/links/link-state";
import { type CliIo, main } from "@/scripts/link-control/main";
import { resetUrlTables } from "../utils/reset-db";

resetUrlTables();

const CODE = "cli-control-code";
const DESTINATION = "https://destination.example/secret-path";

async function insertLink() {
  const [{ id }] = await db
    .insert(urlMappings)
    .values({ shortCode: CODE, originalUrl: DESTINATION, expiresAt: new Date(Date.now() + 86_400_000), accessCount: 1 })
    .returning({ id: urlMappings.id });
  await db.insert(accessLog).values({ urlMappingId: id });
}

async function stateOf() {
  const [row] = await db.select({ state: linkState }).from(urlMappings).where(eq(urlMappings.shortCode, CODE));
  return row?.state;
}

function io(overrides: Partial<CliIo> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const value: CliIo = {
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
    interactive: false,
    prompt: vi.fn().mockRejectedValue(new Error("no prompt expected")),
    ...overrides,
  };
  return { io: value, out, err };
}

describe("link-control CLI main", () => {
  it("disables, re-disables, enables and deletes as the operator", async () => {
    await insertLink();

    let t = io();
    expect(await main(["disable", `http://localhost:3000/${CODE}`], t.io)).toBe(0);
    expect(t.out).toEqual([`disabled: ${CODE}`]);
    expect(await stateOf()).toBe("disabled");
    const [row] = await db.select({ by: urlMappings.disabledBy }).from(urlMappings).where(eq(urlMappings.shortCode, CODE));
    expect(row.by).toBe("operator");

    t = io();
    expect(await main(["disable", CODE], t.io)).toBe(0);
    expect(t.out).toEqual([`already disabled: ${CODE}`]);

    t = io();
    expect(await main(["enable", CODE], t.io)).toBe(0);
    expect(t.out).toEqual([`enabled: ${CODE}`]);
    expect(await stateOf()).toBe("active");

    // Non-interactive delete without --yes is refused and changes nothing.
    t = io();
    expect(await main(["delete", CODE], t.io)).toBe(2);
    expect(t.err[0]).toMatch(/^refused:/);
    expect(await stateOf()).toBe("active");

    // A wrong interactive confirmation aborts.
    t = io({ interactive: true, prompt: vi.fn().mockResolvedValue("something-else") });
    expect(await main(["delete", CODE], t.io)).toBe(1);
    expect(t.err[0]).toMatch(/^aborted:/);
    expect(await stateOf()).toBe("active");

    // Typing the code confirms.
    t = io({ interactive: true, prompt: vi.fn().mockResolvedValue(`${CODE}\n`) });
    expect(await main(["delete", CODE], t.io)).toBe(0);
    expect(t.out).toEqual([`deleted: ${CODE}`]);
    expect(await stateOf()).toBe("deleted");
    expect(await db.select().from(accessLog)).toEqual([]);

    t = io();
    expect(await main(["delete", "--yes", CODE], t.io)).toBe(0);
    expect(t.out).toEqual([`already deleted: ${CODE}`]);

    t = io();
    expect(await main(["enable", CODE], t.io)).toBe(1);
    expect(t.err).toEqual([`cannot enable, the link was deleted: ${CODE}`]);

    t = io();
    expect(await main(["disable", "missing-code"], t.io)).toBe(1);
    expect(t.err).toEqual(["not found: missing-code"]);
  });

  it("never prints the destination URL", async () => {
    await insertLink();
    const t = io();
    for (const argv of [["disable", CODE], ["enable", CODE], ["delete", "-y", CODE]]) await main(argv, t.io);
    expect([...t.out, ...t.err].join("\n")).not.toContain("destination.example");
  });

  it("reports a database failure by code only", async () => {
    const t = io();
    const spy = vi.spyOn(db, "execute").mockRejectedValueOnce(Object.assign(new Error("connect to db.internal:5432 as admin"), { code: "ECONNREFUSED" }));
    expect(await main(["disable", CODE], t.io)).toBe(1);
    expect(t.err).toEqual(["error: the database operation failed (ECONNREFUSED)"]);
    spy.mockRestore();
  });

  it("finds the code on the cause of a wrapped driver error", async () => {
    const t = io();
    const driverError = Object.assign(new Error('database "x" does not exist'), { code: "3D000" });
    const spy = vi.spyOn(db, "execute").mockRejectedValueOnce(new Error("Failed query: select ... params: secret", { cause: driverError }));
    expect(await main(["disable", CODE], t.io)).toBe(1);
    expect(t.err).toEqual(["error: the database operation failed (3D000)"]);
    spy.mockRestore();
  });
});
