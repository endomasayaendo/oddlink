import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/issue/route";
import { resetUrlTables } from "../utils/reset-db";

resetUrlTables();

const post = (body?: string) =>
  POST(new Request("http://localhost:3000/api/issue", { method: "POST", headers: { "content-type": "application/json" }, body }));

describe("POST /api/issue", () => {
  it("returns the short URL as JSON", async () => {
    const res = await post(JSON.stringify({ originalUrl: "https://example.com" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.originalUrl).toBe("https://example.com");
    expect(json.shortUrl).toMatch(/^http:\/\/localhost:3000\/[a-z]+(-[a-z]+)+$/);
  });

  it("returns 400 when the URL is blank", async () => {
    const res = await post(JSON.stringify({ originalUrl: "" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "URL is required" });
  });

  it("returns 400 when the URL is invalid", async () => {
    const res = await post(JSON.stringify({ originalUrl: "not-a-url" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "Must be a valid http or https URL" });
  });

  it("returns 400 when the body is empty or not JSON", async () => {
    expect((await post()).status).toBe(400);
    expect((await post("{oops")).status).toBe(400);
  });
});
