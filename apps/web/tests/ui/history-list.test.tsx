// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HistoryList } from "@/ui/links/history-list";
import type { HistoryEntry } from "@/ui/links/use-history";

function entry(shortCode: string): HistoryEntry {
  return {
    shortCode,
    shortUrl: `http://localhost:3000/${shortCode}`,
    originalUrl: `https://example.com/${shortCode}`,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function Harness({ codes }: { codes: string[] }) {
  const [history, setHistory] = useState(codes.map(entry));
  return <HistoryList history={history} onRemove={(code) => setHistory((h) => h.filter((e) => e.shortCode !== code))} />;
}

function removeWithKeyboardFocus(code: string) {
  const button = screen.getByRole("button", { name: `Remove ${code}` });
  button.focus();
  fireEvent.click(button);
}

afterEach(cleanup);

describe("HistoryList", () => {
  it("renders nothing while there is no history", () => {
    const { container } = render(<Harness codes={[]} />);
    expect(container.childElementCount).toBe(0);
  });

  it("names each row's actions after its short code", () => {
    render(<Harness codes={["alpha", "beta"]} />);

    for (const code of ["alpha", "beta"]) {
      expect(screen.getByRole("link", { name: `Analytics for ${code}` }).getAttribute("href")).toBe(`/analytics/${code}`);
      expect(screen.getByRole("button", { name: `Copy ${code}` }).textContent).toBe("Copy");
      expect(screen.getByRole("button", { name: `Remove ${code}` }).textContent).toBe("×");
    }
    expect(screen.getByRole("region", { name: "Recent links" })).toBeTruthy();
  });

  it("moves focus to the next row's Remove button after a removal", () => {
    render(<Harness codes={["alpha", "beta", "gamma"]} />);

    removeWithKeyboardFocus("alpha");

    expect(screen.queryByRole("button", { name: "Remove alpha" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Remove beta" }));
  });

  it("moves focus to the previous row's Remove button when the last row is removed", () => {
    render(<Harness codes={["alpha", "beta", "gamma"]} />);

    removeWithKeyboardFocus("gamma");

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Remove beta" }));
  });

  it("moves focus to the heading when the list becomes empty", () => {
    render(<Harness codes={["alpha"]} />);

    removeWithKeyboardFocus("alpha");

    const heading = screen.getByRole("heading", { name: "Recent links" });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByText("No recent links.")).toBeTruthy();
  });

  it("leaves focus alone when the parent does not remove the entry", () => {
    render(<HistoryList history={[entry("alpha"), entry("beta")]} onRemove={() => {}} />);

    removeWithKeyboardFocus("alpha");

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Remove alpha" }));
  });
});
