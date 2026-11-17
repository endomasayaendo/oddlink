import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GONE_VARIANTS, goneMessage, goneVariant } from "@/lib/links/gone";
import { GONE_PAGE_TIMEOUT_MS, serveGone } from "@/lib/middleware/utils/serve-gone";
import { stubGonePages } from "../utils/stub-gone-page";
import { NO_STORE_CACHE_CONTROL } from "@/lib/middleware/utils/rewrite-not-found";

const appGone = join(import.meta.dirname, "../../app/gone");

describe("gone variants", () => {
  it.each([
    [{ state: "disabled", by: "owner" }, "disabled"],
    [{ state: "disabled", by: "operator" }, "disabled-flagged"],
    [{ state: "disabled", by: "automated" }, "disabled-flagged"],
    [{ state: "deleted", by: "owner" }, "deleted"],
    [{ state: "deleted", by: "operator" }, "deleted-flagged"],
  ] as const)("%j → %s", (status, variant) => {
    expect(goneVariant(status)).toBe(variant);
  });

  it("gives a reason only when someone other than the owner acted, and never a detection method", () => {
    expect(goneMessage("disabled")).toBe("This link was disabled.");
    expect(goneMessage("deleted")).toBe("This link was deleted.");
    expect(goneMessage("disabled-flagged")).toBe("This link was disabled because it was reported or flagged as unsafe.");
    expect(goneMessage("deleted-flagged")).toBe("This link was deleted because it was reported or flagged as unsafe.");
  });

  it("has a static page for every variant, and no page without a variant", () => {
    const pages = readdirSync(appGone).filter((name) => existsSync(join(appGone, name, "page.tsx")));
    expect(pages.sort()).toEqual([...GONE_VARIANTS].sort());
    for (const variant of GONE_VARIANTS) {
      expect(readFileSync(join(appGone, variant, "page.tsx"), "utf8")).toContain(`variant="${variant}"`);
    }
  });
});

describe("serveGone", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("answers 410 with the variant's static page from BASE_URL, uncached and not indexed", async () => {
    const fetch = stubGonePages();
    const res = await serveGone({ state: "deleted", by: "operator" });
    expect(res.status).toBe(410);
    expect(fetch).toHaveBeenCalledWith("http://localhost:3000/gone/deleted-flagged", expect.anything());
    expect(await res.text()).toBe("<html>gone page http://localhost:3000/gone/deleted-flagged</html>");
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe(NO_STORE_CACHE_CONTROL);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.headers.get("location")).toBeNull();
  });

  it("still answers 410, with the wording as plain text, when the page can't be loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connection refused"));
    const res = await serveGone({ state: "disabled", by: "automated" });
    expect(res.status).toBe(410);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe(NO_STORE_CACHE_CONTROL);
    expect(await res.text()).toBe("This link was disabled because it was reported or flagged as unsafe.");
    expect(console.error).toHaveBeenCalled();
  });

  it("gives up on a page that doesn't answer in time, instead of holding the response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("timed out", "TimeoutError")), 10);
      return controller.signal;
    });
    // Never answers on its own; only the abort signal ends it.
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_, init) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))),
    );
    const res = await serveGone({ state: "deleted", by: "owner" });
    expect(res.status).toBe(410);
    expect(await res.text()).toBe("This link was deleted.");
    expect(AbortSignal.timeout).toHaveBeenCalledWith(GONE_PAGE_TIMEOUT_MS);
  });

  it("does not pass on a response that is not HTML, such as a challenge in front of the origin", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { headers: { "Content-Type": "application/json" } }));
    const res = await serveGone({ state: "disabled", by: "owner" });
    expect(res.status).toBe(410);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await res.text()).toBe("This link was disabled.");
  });

  async function loadProduction() {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SAFE_BROWSING_API_KEY", "test-only");
    const mod = await import("@/lib/middleware/utils/serve-gone");
    vi.spyOn(console, "error").mockImplementation(() => {});
    return mod;
  }

  const contentType = async (res: Promise<Response>) => (await res).headers.get("content-type");

  it("fetches each page once per process in production", async () => {
    const { serveGone: serve } = await loadProduction();
    const fetch = stubGonePages();
    for (let i = 0; i < 3; i++) expect(await contentType(serve({ state: "disabled", by: "owner" }))).toContain("text/html");
    await serve({ state: "deleted", by: "owner" });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "http://localhost:3000/gone/disabled",
      "http://localhost:3000/gone/deleted",
    ]);
  });

  describe("after a failed fetch in production", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("answers with the plain-text 410 without fetching again until the retry delay has passed", async () => {
      const { serveGone: serve, GONE_PAGE_RETRY_AFTER_MS } = await loadProduction();
      const fetch = stubGonePages().mockRejectedValueOnce(new Error("not up yet"));
      expect(await contentType(serve({ state: "disabled", by: "owner" }))).toContain("text/plain");
      expect(fetch).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(GONE_PAGE_RETRY_AFTER_MS - 1);
      for (let i = 0; i < 3; i++) {
        const res = await serve({ state: "disabled", by: "owner" });
        expect(res.status).toBe(410);
        expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
        expect(res.headers.get("cache-control")).toBe(NO_STORE_CACHE_CONTROL);
        expect(res.headers.get("x-robots-tag")).toBe("noindex");
        expect(await res.text()).toBe("This link was disabled.");
      }
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1);
      expect(await contentType(serve({ state: "disabled", by: "owner" }))).toContain("text/html");
      expect(await contentType(serve({ state: "disabled", by: "owner" }))).toContain("text/html");
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("waits again after another failure once the delay has passed", async () => {
      const { serveGone: serve, GONE_PAGE_RETRY_AFTER_MS } = await loadProduction();
      const fetch = stubGonePages().mockRejectedValueOnce(new Error("down")).mockRejectedValueOnce(new Error("still down"));
      await serve({ state: "disabled", by: "owner" });
      vi.advanceTimersByTime(GONE_PAGE_RETRY_AFTER_MS);
      expect(await contentType(serve({ state: "disabled", by: "owner" }))).toContain("text/plain");
      expect(await contentType(serve({ state: "disabled", by: "owner" }))).toContain("text/plain");
      expect(fetch).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(GONE_PAGE_RETRY_AFTER_MS);
      expect(await contentType(serve({ state: "disabled", by: "owner" }))).toContain("text/html");
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it("keeps fetching the other pages", async () => {
      const { serveGone: serve } = await loadProduction();
      const fetch = stubGonePages().mockRejectedValueOnce(new Error("not up yet"));
      await serve({ state: "disabled", by: "owner" });
      expect(await contentType(serve({ state: "deleted", by: "owner" }))).toContain("text/html");
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        "http://localhost:3000/gone/disabled",
        "http://localhost:3000/gone/deleted",
      ]);
    });
  });

  it("fetches again on every request outside production, even after a failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetch = stubGonePages().mockRejectedValueOnce(new Error("not up yet"));
    expect(await contentType(serveGone({ state: "disabled", by: "owner" }))).toContain("text/plain");
    expect(await contentType(serveGone({ state: "disabled", by: "owner" }))).toContain("text/html");
    expect(await contentType(serveGone({ state: "disabled", by: "owner" }))).toContain("text/html");
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
