import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { parse } from "@/lib/middleware/utils/parse";

const parsed = (path: string) => parse(new NextRequest(`http://localhost:3000${path}`));

describe("parse", () => {
  it("reads a single segment as a key", () => {
    expect(parsed("/golden-clock")).toMatchObject({ key: "golden-clock", preview: false, analyticsKey: null, previewPageKey: null });
  });

  it("detects one trailing + as a preview", () => {
    expect(parsed("/golden-clock+")).toMatchObject({ key: "golden-clock", preview: true });
  });

  it.each(["%2B", "%2b"])("treats an encoded plus (%s) like a literal one", (plus) => {
    expect(parsed(`/golden-clock${plus}`)).toMatchObject({ key: "golden-clock", preview: true });
  });

  it("decodes the key before looking for the plus", () => {
    expect(parsed(`/${encodeURIComponent("café-😀")}+`)).toMatchObject({ key: "café-😀", preview: true });
  });

  it("strips only one plus, leaving the rest in the key", () => {
    expect(parsed("/code++")).toMatchObject({ key: "code+", preview: true });
    expect(parsed("/++")).toMatchObject({ key: "+", preview: true });
  });

  it("reads a bare plus as a preview of an empty key", () => {
    expect(parsed("/+")).toMatchObject({ key: "", preview: true });
  });

  it("does not treat a plus in the middle as a preview", () => {
    expect(parsed("/co+de")).toMatchObject({ key: "co+de", preview: false });
  });

  it("gives an undecodable segment an empty key and no preview", () => {
    expect(parsed("/%E0%A4%A")).toMatchObject({ key: "", preview: false });
    expect(parsed("/%E0%A4%A+")).toMatchObject({ key: "", preview: false });
  });

  it("has no key for multi-segment paths, and never a preview", () => {
    expect(parsed("/a/b+")).toMatchObject({ key: "", preview: false });
  });

  it("reads /analytics/{code} as an analytics key, keeping any plus", () => {
    expect(parsed("/analytics/code+")).toMatchObject({ key: "", preview: false, analyticsKey: "code+" });
  });

  it("reads /preview/{code} as a preview page key", () => {
    expect(parsed("/preview/golden-clock")).toMatchObject({ key: "", preview: false, previewPageKey: "golden-clock" });
    expect(parsed("/preview/%E0%A4%A")).toMatchObject({ previewPageKey: "" });
  });
});
