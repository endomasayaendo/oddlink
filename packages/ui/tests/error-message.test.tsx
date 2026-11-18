import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ErrorMessage } from "../src/error-message";

function Harness() {
  const [error, setError] = useState("");
  return (
    <>
      <input aria-label="URL" />
      <button type="button" onClick={() => setError("Failed to copy to clipboard")}>
        Copy
      </button>
      {error && <ErrorMessage message={error} onDismiss={() => setError("")} />}
      <button type="button">After</button>
    </>
  );
}

function showError(origin: HTMLElement | null) {
  const trigger = screen.getByRole("button", { name: "Copy" });
  if (origin) origin.focus();
  else (document.activeElement as HTMLElement | null)?.blur();
  fireEvent.click(trigger);
  return screen.getByRole("button", { name: "Close" });
}

afterEach(cleanup);

describe("ErrorMessage", () => {
  it("shows the message as an alert with a named dismiss button", () => {
    render(<ErrorMessage message="Something broke" onDismiss={() => {}} />);

    expect(screen.getByRole("alert").textContent).toContain("Something broke");
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("puts messageId on the message and its extra content, not on the dismiss button", () => {
    render(
      <ErrorMessage message="Something broke" messageId="err" onDismiss={() => {}}>
        <span> More</span>
      </ErrorMessage>,
    );

    expect(document.getElementById("err")?.textContent).toBe("Something broke More");
  });

  it("returns focus to the element that was focused when it appeared", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Copy" });
    const close = showError(trigger);

    close.focus();
    fireEvent.click(close);

    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("falls back to the nearest focusable element before it when nothing was focused", () => {
    render(<Harness />);
    const close = showError(null);

    close.focus();
    fireEvent.click(close);

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Copy" }));
  });

  it("falls back when the original element is gone", () => {
    function Removable() {
      const [showOrigin, setShowOrigin] = useState(true);
      const [error, setError] = useState("");
      return (
        <>
          <input aria-label="URL" />
          {showOrigin && (
            <button type="button" onClick={() => setError("Oops")}>
              Origin
            </button>
          )}
          {error && <ErrorMessage message={error} onDismiss={() => setError("")} />}
          <button type="button" onClick={() => setShowOrigin(false)}>
            Hide origin
          </button>
        </>
      );
    }
    render(<Removable />);
    const origin = screen.getByRole("button", { name: "Origin" });
    origin.focus();
    fireEvent.click(origin);
    fireEvent.click(screen.getByRole("button", { name: "Hide origin" }));
    expect(origin.isConnected).toBe(false);

    const close = screen.getByRole("button", { name: "Close" });
    close.focus();
    fireEvent.click(close);

    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "URL" }));
  });

  it("does not move focus that is already outside the alert", () => {
    render(<Harness />);
    const close = showError(screen.getByRole("button", { name: "Copy" }));
    const input = screen.getByRole("textbox", { name: "URL" });

    input.focus();
    fireEvent.click(close);

    expect(document.activeElement).toBe(input);
  });
});
