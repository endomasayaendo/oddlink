import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { adjectives } from "@/lib/db/schema";
import { createTtlCache, getWords, WORDS_TTL_MS } from "@/lib/links/get-words";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets pending promise callbacks (such as a background reload) run. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("createTtlCache", () => {
  const TTL = 1_000;

  beforeEach(() => {
    // Only Date is faked; the cache reads the clock and never schedules timers.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("serves the cached value until the TTL passes", async () => {
    let n = 0;
    const load = vi.fn(async () => ++n);
    const get = createTtlCache(load, TTL);

    expect(await get()).toBe(1);
    vi.advanceTimersByTime(TTL - 1);
    expect(await get()).toBe(1);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reloads once after the TTL, serving the old value while the reload runs", async () => {
    const reload = deferred<string>();
    const load = vi.fn<() => Promise<string>>().mockResolvedValueOnce("old").mockReturnValueOnce(reload.promise);
    const get = createTtlCache(load, TTL);

    expect(await get()).toBe("old");
    vi.advanceTimersByTime(TTL);

    const during = await Promise.all([get(), get(), get()]);
    expect(during).toEqual(["old", "old", "old"]);
    expect(load).toHaveBeenCalledTimes(2);

    reload.resolve("new");
    await flush();
    expect(await get()).toBe("new");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares one load between concurrent first calls", async () => {
    const first = deferred<string>();
    const load = vi.fn<() => Promise<string>>().mockReturnValueOnce(first.promise);
    const get = createTtlCache(load, TTL);

    const calls = [get(), get(), get()];
    first.resolve("value");
    expect(await Promise.all(calls)).toEqual(["value", "value", "value"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed first load", async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce("value");
    const get = createTtlCache(load, TTL);

    await expect(get()).rejects.toThrow("db down");
    expect(await get()).toBe("value");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps the old value when a reload fails and retries after another TTL", async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("old")
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce("new");
    const get = createTtlCache(load, TTL, "words");

    expect(await get()).toBe("old");
    vi.advanceTimersByTime(TTL);
    expect(await get()).toBe("old");
    await flush();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("words"), expect.any(Error));

    // The failed reload restarts the clock, so the next attempt waits a full TTL.
    vi.advanceTimersByTime(TTL - 1);
    expect(await get()).toBe("old");
    expect(load).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(1);
    expect(await get()).toBe("old");
    await flush();
    expect(await get()).toBe("new");
    expect(load).toHaveBeenCalledTimes(3);
  });
});

describe("getWords", () => {
  afterEach(async () => {
    vi.useRealTimers();
    await db.update(adjectives).set({ isActive: true }).where(eq(adjectives.word, "purple"));
  });

  it("loads the seeded word lists", async () => {
    const words = await getWords();
    expect(words.adjectives).toHaveLength(40);
    expect(words.nouns).toHaveLength(45);
    expect(words.verbs).toHaveLength(30);
    expect(words.adverbs).toHaveLength(20);
    expect(words.adjectives[0]).toBe("purple");
  });

  it("returns the cached lists on later calls", async () => {
    expect(await getWords()).toBe(await getWords());
  });

  it("picks up a deactivated word after the TTL", async () => {
    // Only Date is faked so the database driver's own timers keep working.
    vi.useFakeTimers({ toFake: ["Date"] });
    expect((await getWords()).adjectives).toContain("purple");

    await db.update(adjectives).set({ isActive: false }).where(eq(adjectives.word, "purple"));
    expect((await getWords()).adjectives).toContain("purple");

    vi.setSystemTime(Date.now() + WORDS_TTL_MS);
    await vi.waitFor(async () => expect((await getWords()).adjectives).not.toContain("purple"));
    expect((await getWords()).adjectives).toHaveLength(39);
  });
});
