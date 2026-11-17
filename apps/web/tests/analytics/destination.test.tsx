import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Destination } from "@/ui/analytics/destination";

describe("Destination", () => {
  it("links to the href, showing the stored text", () => {
    const html = renderToStaticMarkup(<Destination originalUrl="https://example.com/a b" originalHref="https://example.com/a%20b" />);
    expect(html).toContain('href="https://example.com/a%20b"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain(">https://example.com/a b</a>");
  });

  it("shows the stored text without a link when there is no href", () => {
    const html = renderToStaticMarkup(<Destination originalUrl="javascript:alert(1)" originalHref={null} />);
    expect(html).not.toContain("<a");
    expect(html).not.toContain("href");
    expect(html).toContain(">javascript:alert(1)</p>");
  });

  it("renders nothing when the destination is hidden", () => {
    expect(renderToStaticMarkup(<Destination originalUrl={null} originalHref={null} />)).toBe("");
  });
});
