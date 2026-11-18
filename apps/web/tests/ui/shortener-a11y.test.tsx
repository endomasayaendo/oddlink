// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IssueState } from "@/lib/actions/issue-link";
import { SAFE_BROWSING_NOTICE } from "@/lib/links/safe-browsing/advisory";
import { ResultCard } from "@/ui/links/result-card";
import { Shortener } from "@/ui/links/shortener";
import { UrlForm } from "@/ui/links/url-form";

const { issueAction } = vi.hoisted(() => ({ issueAction: vi.fn<(prev: IssueState, formData: FormData) => Promise<IssueState>>() }));

// The real action talks to the database; the UI only needs its result.
vi.mock("@/lib/actions/issue-link", () => ({ issueAction }));

const SHORT_URL = "http://localhost:3000/abc";

afterEach(() => {
  cleanup();
  issueAction.mockReset();
  localStorage.clear();
});

describe("UrlForm", () => {
  it("labels the URL input with a visually hidden label", () => {
    render(<UrlForm action={() => {}} pending={false} />);
    const input = screen.getByLabelText("URL to shorten");

    expect(input.getAttribute("name")).toBe("originalUrl");
    expect(document.querySelector(`label[for="${input.id}"]`)?.classList.contains("sr-only")).toBe(true);
  });

  it("shows a placeholder that includes the scheme", () => {
    render(<UrlForm action={() => {}} pending={false} />);
    expect(screen.getByLabelText("URL to shorten").getAttribute("placeholder")).toMatch(/^https:\/\//);
  });
});

describe("Shortener", () => {
  beforeEach(() => {
    // jsdom has no matchMedia; reporting reduced motion keeps the page-flip overlay out of the way.
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("announces progress and the result through a status region that exists beforehand", async () => {
    let resolve!: (state: IssueState) => void;
    issueAction.mockReturnValue(new Promise((r) => (resolve = r)));

    render(<Shortener />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");

    fireEvent.change(screen.getByLabelText("URL to shorten"), { target: { value: "https://example.com/" } });
    await act(async () => {
      screen.getByRole<HTMLFormElement>("button", { name: "Shorten" }).form!.requestSubmit();
    });
    expect(screen.getByRole("status")).toBe(status);
    expect(within(status).getByText("Shortening...")).toBeTruthy();

    await act(async () => {
      resolve({ ok: true, shortCode: "abc", shortUrl: SHORT_URL, originalUrl: "https://example.com/" });
    });
    expect(screen.getByRole("status")).toBe(status);
    expect(within(status).queryByText("Shortening...")).toBeNull();
    expect(within(status).getByRole("link", { name: SHORT_URL })).toBeTruthy();
  });

  it("shows a failed submit right under the form, above the Safe Browsing notice, and describes the input with it", async () => {
    issueAction.mockResolvedValue({ ok: false, message: "Invalid URL." });

    render(<Shortener />);
    const input = screen.getByLabelText("URL to shorten");
    expect(input.hasAttribute("aria-describedby")).toBe(false);

    fireEvent.change(input, { target: { value: "https://example.com@evil.example/" } });
    await act(async () => {
      screen.getByRole<HTMLFormElement>("button", { name: "Shorten" }).form!.requestSubmit();
    });

    const alert = screen.getByRole("alert");
    const form = input.closest("form")!;
    const notice = screen.getByText(SAFE_BROWSING_NOTICE);
    expect(form.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(alert.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // The description is the message alone, not the dismiss button's name.
    const description = document.getElementById(screen.getByLabelText("URL to shorten").getAttribute("aria-describedby")!);
    expect(description?.textContent).toBe("Invalid URL.");

    await act(async () => fireEvent.click(within(alert).getByRole("button", { name: "Close" })));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("URL to shorten").hasAttribute("aria-describedby")).toBe(false);
  });

  it("shows the result card above the Safe Browsing notice", async () => {
    issueAction.mockResolvedValue({ ok: true, shortCode: "abc", shortUrl: SHORT_URL, originalUrl: "https://example.com/" });

    render(<Shortener />);
    fireEvent.change(screen.getByLabelText("URL to shorten"), { target: { value: "https://example.com/" } });
    await act(async () => {
      screen.getByRole<HTMLFormElement>("button", { name: "Shorten" }).form!.requestSubmit();
    });

    const card = within(screen.getByRole("status")).getByRole("link", { name: SHORT_URL });
    const notice = screen.getByText(SAFE_BROWSING_NOTICE);
    expect(card.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("ResultCard", () => {
  let writeText: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>;
  let originalClipboard: PropertyDescriptor | undefined;

  beforeEach(() => {
    writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  });

  afterEach(() => {
    if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
    else delete (navigator as { clipboard?: unknown }).clipboard;
  });

  it("announces a copy through a polite live region that is present before the copy", async () => {
    const { container } = render(<ResultCard shortCode="abc" shortUrl={SHORT_URL} onError={() => {}} />);
    const live = container.querySelector('[aria-live="polite"]')!;
    expect(live.classList.contains("sr-only")).toBe(true);
    expect(live.textContent).toBe("");

    const button = screen.getByRole("button", { name: "Copy short link" });
    await act(async () => fireEvent.click(button));

    expect(writeText).toHaveBeenCalledWith(SHORT_URL);
    expect(container.querySelector('[aria-live="polite"]')).toBe(live);
    expect(live.textContent).toBe("Copied!");
    // The visible label still swaps, while the accessible name stays fixed.
    expect(button.textContent).toBe("Copied!");
    expect(screen.getByRole("button", { name: "Copy short link" })).toBe(button);
  });
});
