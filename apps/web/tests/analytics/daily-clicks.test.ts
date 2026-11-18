import { describe, expect, it } from "vitest";
import { clicksLabel, summarizeDailyClicks } from "@/lib/analytics/daily-clicks";

describe("clicksLabel", () => {
  it("uses the singular only for one", () => {
    expect(clicksLabel(0)).toBe("0 clicks");
    expect(clicksLabel(1)).toBe("1 click");
    expect(clicksLabel(2)).toBe("2 clicks");
  });
});

describe("summarizeDailyClicks", () => {
  it("names the range, the total and the busiest day", () => {
    const days = [
      { date: "Nov 1", count: 2 },
      { date: "Nov 3", count: 5 },
      { date: "Nov 7", count: 1 },
    ];
    expect(summarizeDailyClicks(days)).toBe("Daily clicks, Nov 1 to Nov 7: 8 clicks in total, most on Nov 3 (5 clicks).");
  });

  it("picks the earliest day on a tie", () => {
    const days = [
      { date: "Nov 1", count: 3 },
      { date: "Nov 2", count: 3 },
    ];
    expect(summarizeDailyClicks(days)).toBe("Daily clicks, Nov 1 to Nov 2: 6 clicks in total, most on Nov 1 (3 clicks).");
  });

  it("states a single day plainly", () => {
    expect(summarizeDailyClicks([{ date: "Nov 5", count: 1 }])).toBe("Daily clicks, Nov 5: 1 click.");
  });

  it("handles no days", () => {
    expect(summarizeDailyClicks([])).toBe("Daily clicks: no clicks yet.");
  });
});
