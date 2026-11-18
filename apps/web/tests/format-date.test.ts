import { afterEach, describe, expect, it, vi } from "vitest";
import { formatDate } from "@/lib/format-date";

describe("formatDate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('returns "-" when there is no date', () => {
    expect(formatDate(null)).toBe("-");
  });

  it("formats the calendar day in APP_TIME_ZONE, not UTC", () => {
    // 23:30 UTC on Jan 1 is already Jan 2 in Asia/Tokyo (the test APP_TIME_ZONE).
    expect(formatDate(new Date("2026-01-01T23:30:00Z"))).toBe("Jan 2, 2026");
  });

  it("follows a different APP_TIME_ZONE", async () => {
    vi.stubEnv("APP_TIME_ZONE", "America/New_York");
    vi.resetModules();
    const { formatDate: formatInNewYork } = await import("@/lib/format-date");

    // 03:30 UTC on Jan 2 is still Jan 1 in New York, and already Jan 2 in Tokyo and UTC.
    expect(formatInNewYork(new Date("2026-01-02T03:30:00Z"))).toBe("Jan 1, 2026");
  });
});
