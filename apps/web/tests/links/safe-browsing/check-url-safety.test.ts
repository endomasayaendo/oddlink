import { afterEach, describe, expect, it, vi } from "vitest";
import { CAPTURED } from "./protobuf-fixtures";

// checkUrlSafety memoizes the env and its client per module instance, so reload it per case.
async function load() {
  vi.resetModules();
  return (await import("@/lib/links/safe-browsing")).checkUrlSafety;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("checkUrlSafety", () => {
  it("skips the lookup without a key and warns once per process", async () => {
    vi.stubEnv("SAFE_BROWSING_API_KEY", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const check = await load();
    expect(await check("https://example.com")).toBe("unknown");
    expect(await check("https://example.org")).toBe("unknown");
    expect(fetch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("safe_browsing outcome=skipped", expect.any(Object));
  });

  it("uses the configured key and an oddlink User-Agent", async () => {
    vi.stubEnv("SAFE_BROWSING_API_KEY", "configured-key");
    const fetch = vi.fn(async () => new Response(new Uint8Array(CAPTURED.noMatch)));
    vi.stubGlobal("fetch", fetch);

    const check = await load();
    expect(await check("https://example.com")).toBe("safe");
    const headers = new Headers((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers);
    expect(headers.get("X-Goog-Api-Key")).toBe("configured-key");
    expect(headers.get("User-Agent")).toMatch(/^oddlink\/\d+\.\d+\.\d+$/);
  });
});
