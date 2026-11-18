import { describe, expect, it } from "vitest";
import { metadata as analyticsMetadata } from "@/app/analytics/[shortCode]/page";
import { metadata as previewMetadata } from "@/app/preview/[shortCode]/page";
import { NOINDEX_SOURCES } from "@/lib/http/robots-headers";
import nextConfig from "@/next.config";

// Both pages stream behind a prerendered shell, so a notFound() in the stream keeps the 200.
// The noindex signals must not depend on the lookup: a static metadata export (rendered in the
// shell's <head>) and a header rule (sent before anything streams).
describe("noindex on the per-link pages", () => {
  it.each([
    ["/analytics/[shortCode]", analyticsMetadata],
    ["/preview/[shortCode]", previewMetadata],
  ])("%s exports static robots metadata", (_route, metadata) => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it.each(["/analytics/:shortCode", "/preview/:shortCode"])("next.config sends X-Robots-Tag on %s", async (source) => {
    expect(NOINDEX_SOURCES).toContain(source);
    const rules = await nextConfig.headers!();
    const rule = rules.find((r) => r.source === source);
    expect(rule?.headers).toContainEqual({ key: "X-Robots-Tag", value: "noindex, nofollow" });
  });

  it("keeps the noindex rules off other paths", async () => {
    const rules = await nextConfig.headers!();
    const noindexSources = rules.filter((r) => r.headers.some((h) => h.key === "X-Robots-Tag")).map((r) => r.source);
    expect(noindexSources.sort()).toEqual([...NOINDEX_SOURCES].sort());
  });
});
