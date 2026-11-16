import { vi } from "vitest";

/** Stands in for the static gone pages: each answers with HTML naming the URL it was fetched from. */
export function stubGonePages() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!new URL(url).pathname.startsWith("/gone/")) throw new Error(`unexpected fetch ${url}`);
    return new Response(`<html>gone page ${url}</html>`, { headers: { "Content-Type": "text/html" } });
  });
}
