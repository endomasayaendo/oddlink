import { afterEach, describe, expect, it, vi } from "vitest";
import { notFound, redirect } from "next/navigation";
import { ACTION_FAILED_MESSAGE, submitIssue } from "@/ui/links/submit-issue";

const form = (originalUrl?: string) => {
  const data = new FormData();
  if (originalUrl !== undefined) data.set("originalUrl", originalUrl);
  return data;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("submitIssue", () => {
  it("returns a success unchanged", async () => {
    const success = { ok: true as const, shortCode: "a-b", shortUrl: "http://localhost:3000/a-b", originalUrl: "https://example.com" };
    await expect(submitIssue(async () => success, form("https://example.com"))).resolves.toEqual(success);
  });

  it("passes null as the previous state", async () => {
    const action = vi.fn(async () => null);
    const data = form("https://example.com");
    await submitIssue(action, data);
    expect(action).toHaveBeenCalledWith(null, data);
  });

  it("keeps the submitted URL on a failure the action returns", async () => {
    const failure = { ok: false as const, reason: "unsafe_url" as const, message: "Unsafe" };
    await expect(submitIssue(async () => failure, form("https://bad.example"))).resolves.toEqual({
      ...failure,
      submitted: "https://bad.example",
    });
  });

  it("turns a rejected action into a failure that keeps the submitted URL", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("An unexpected response was received from the server.");

    const state = await submitIssue(async () => {
      throw error;
    }, form("https://example.com/typed"));

    expect(state).toEqual({ ok: false, message: ACTION_FAILED_MESSAGE, submitted: "https://example.com/typed" });
    // No reason, so the Safe Browsing advisory (reason "unsafe_url" only) never shows for it.
    expect(state && !state.ok && "reason" in state).toBe(false);
    expect(consoleError).toHaveBeenCalledWith(error);
  });

  it("handles a rejection with no URL in the form", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(submitIssue(() => Promise.reject(new TypeError("Failed to fetch")), form())).resolves.toEqual({
      ok: false,
      message: ACTION_FAILED_MESSAGE,
      submitted: "",
    });
  });

  it.each([
    ["redirect", () => redirect("/elsewhere")],
    ["notFound", () => notFound()],
  ])("rethrows a %s from the action so Next.js can handle it", async (_name, thrower) => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      submitIssue(async () => {
        thrower();
        return null;
      }, form("https://example.com")),
    ).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_/) });
    expect(consoleError).not.toHaveBeenCalled();
  });
});
