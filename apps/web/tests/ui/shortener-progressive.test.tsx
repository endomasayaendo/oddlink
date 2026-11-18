// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IssueState } from "@/lib/actions/issue-link";
import type { FormState } from "@/lib/actions/issue-form-state";
import { Shortener } from "@/ui/links/shortener";

const { issueAction, issueFormAction } = vi.hoisted(() => {
  // Stands in for a Server Action reference: React DOM renders a form whose action carries
  // `$$FORM_ACTION` as a real form post, using the fields it returns.
  const formFields = () => ({ name: "$ACTION_ID_issue", action: "", encType: "multipart/form-data", method: "POST", data: null });
  const issueFormAction = Object.assign(vi.fn<(prev: FormState, formData: FormData) => Promise<FormState>>(), {
    $$FORM_ACTION: formFields,
    bind: (_this: unknown, ..._args: unknown[]) => Object.assign(() => {}, { $$FORM_ACTION: formFields }),
  });
  return { issueAction: vi.fn<(prev: IssueState, formData: FormData) => Promise<IssueState>>(), issueFormAction };
});

vi.mock("@/lib/actions/issue-link", () => ({ issueAction, issueFormAction }));

afterEach(() => {
  cleanup();
  issueAction.mockReset();
  issueFormAction.mockReset();
  localStorage.clear();
});

describe("Shortener before hydration", () => {
  it("renders a form that posts to the Server Action", () => {
    const html = renderToString(<Shortener />);
    const form = new DOMParser().parseFromString(html, "text/html").querySelector("form")!;

    expect(form.getAttribute("method")).toBe("POST");
    expect(form.getAttribute("enctype")).toBe("multipart/form-data");
    expect(form.getAttribute("action")).not.toMatch(/^javascript:/);
    expect(form.querySelector('input[type="hidden"][name="$ACTION_ID_issue"]')).not.toBeNull();
    expect(form.querySelector('input[name="originalUrl"]')).not.toBeNull();
  });
});

describe("Shortener after hydration", () => {
  beforeEach(() => {
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

  it("submits through the browser-side wrapper and records the result in history once", async () => {
    const shortUrl = "http://localhost:3000/abc";
    issueAction.mockResolvedValue({ ok: true, shortCode: "abc", shortUrl, originalUrl: "https://example.com/" });

    render(<Shortener />);
    fireEvent.change(screen.getByLabelText("URL to shorten"), { target: { value: "https://example.com/" } });
    await act(async () => {
      screen.getByRole<HTMLFormElement>("button", { name: "Shorten" }).form!.requestSubmit();
    });

    expect(issueFormAction).not.toHaveBeenCalled();
    expect(issueAction).toHaveBeenCalledTimes(1);
    const history = JSON.parse(localStorage.getItem("oddlink_history") ?? "[]") as { shortCode: string }[];
    expect(history.map((e) => e.shortCode)).toEqual(["abc"]);
    expect(screen.getAllByRole("link", { name: shortUrl }).length).toBeGreaterThan(0);
  });

  it("turns a rejected action call into an error instead of throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    issueAction.mockRejectedValue(new Error("Failed to fetch"));

    render(<Shortener />);
    fireEvent.change(screen.getByLabelText("URL to shorten"), { target: { value: "https://example.com/" } });
    await act(async () => {
      screen.getByRole<HTMLFormElement>("button", { name: "Shorten" }).form!.requestSubmit();
    });

    expect(screen.getByRole("alert").textContent).toContain("Something went wrong");
    expect(screen.getByLabelText<HTMLInputElement>("URL to shorten").value).toBe("https://example.com/");
  });
});
