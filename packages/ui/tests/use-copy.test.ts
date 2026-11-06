import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCopy } from "../src/hooks/use-copy";

describe("useCopy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resets copied two seconds after a copy", async () => {
    const { result } = renderHook(() => useCopy());

    await act(() => result.current.copy("a"));
    expect(result.current.copied).toBe(true);

    act(() => vi.advanceTimersByTime(1999));
    expect(result.current.copied).toBe(true);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.copied).toBe(false);
  });

  it("restarts the two-second window on a repeated copy", async () => {
    const { result } = renderHook(() => useCopy());

    await act(() => result.current.copy("a"));
    act(() => vi.advanceTimersByTime(1500));
    await act(() => result.current.copy("a"));

    // 2.5s: the first copy's timer would have fired at 2s.
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.copied).toBe(true);

    // 3.5s: two seconds after the second copy.
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.copied).toBe(false);
  });

  it("clears the pending timer on unmount", async () => {
    const { result, unmount } = renderHook(() => useCopy());

    await act(() => result.current.copy("a"));
    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports an error when the clipboard write fails", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("denied"));
    const onError = vi.fn();
    const { result } = renderHook(() => useCopy(onError));

    await act(() => result.current.copy("a"));

    expect(result.current.copied).toBe(false);
    expect(onError).toHaveBeenCalledWith("Failed to copy to clipboard");
  });
});
