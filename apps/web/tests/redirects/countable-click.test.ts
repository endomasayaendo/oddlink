import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { isCountableClick, isPrefetch } from "@/lib/middleware/utils/is-countable-click";

const CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
const IOS_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";
const IOS_INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0.0.0 (iPhone15,2; iOS 18_6; ja_JP; ja; scale=3.00; 1179x2556; 0)";
const IOS_LINE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/15.10.0";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36";

const SLACKBOT = "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)";
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const FACEBOOK = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const TWITTERBOT = "Twitterbot/1.0";
const DISCORDBOT = "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)";

const request = (headers: Record<string, string>) => new NextRequest("http://localhost:3000/some-code", { headers });

describe("isPrefetch", () => {
  it.each([
    ["Sec-Purpose: prefetch", { "sec-purpose": "prefetch" }],
    ["Sec-Purpose: prefetch;prerender", { "sec-purpose": "prefetch;prerender" }],
    ["Sec-Purpose with spaces around parameters", { "sec-purpose": " prefetch ; prerender " }],
    ["Sec-Purpose: prefetch;anonymous-client-ip", { "sec-purpose": "prefetch;anonymous-client-ip" }],
    ["Sec-Purpose in upper case", { "sec-purpose": "PREFETCH" }],
    ["Sec-Purpose in mixed case with a parameter", { "sec-purpose": "Prefetch;Prerender" }],
    ["prefetch as a later list item", { "sec-purpose": "other, prefetch" }],
    ["legacy Purpose: prefetch", { purpose: "prefetch" }],
    ["legacy Purpose in mixed case", { purpose: "Prefetch" }],
  ])("is true for %s", (_, headers) => {
    expect(isPrefetch(new Headers(headers))).toBe(true);
  });

  it.each([
    ["no purpose headers", {}],
    ["an empty Sec-Purpose", { "sec-purpose": "" }],
    ["another purpose", { "sec-purpose": "prerender" }],
    ["prefetch only as a parameter", { "sec-purpose": "other;prefetch" }],
    ["a token that merely contains prefetch", { "sec-purpose": "prefetching" }],
    ["a legacy Purpose with another value", { purpose: "preview" }],
    ["prefetch in an unrelated header", { "x-purpose": "prefetch" }],
  ])("is false for %s", (_, headers) => {
    expect(isPrefetch(new Headers(headers))).toBe(false);
  });
});

describe("isCountableClick", () => {
  it.each([
    ["desktop Chrome", CHROME],
    ["desktop Safari", SAFARI],
    ["iOS Safari", IOS_SAFARI],
    ["the Instagram in-app browser on iOS", IOS_INSTAGRAM],
    ["the LINE in-app browser on iOS", IOS_LINE],
    ["Android Chrome", ANDROID_CHROME],
  ])("counts a normal GET from %s", (_, ua) => {
    expect(isCountableClick(request({ "user-agent": ua }))).toBe(true);
  });

  it("counts a GET without a User-Agent", () => {
    expect(isCountableClick(request({}))).toBe(true);
  });

  it.each([
    ["Slackbot", SLACKBOT],
    ["Googlebot", GOOGLEBOT],
    ["facebookexternalhit", FACEBOOK],
    ["Twitterbot", TWITTERBOT],
    ["Discordbot", DISCORDBOT],
  ])("does not count %s", (_, ua) => {
    expect(isCountableClick(request({ "user-agent": ua }))).toBe(false);
  });

  it.each([
    ["Sec-Purpose", { "sec-purpose": "prefetch;prerender" }],
    ["Purpose", { purpose: "prefetch" }],
  ])("does not count a browser prefetch marked with %s", (_, headers) => {
    expect(isCountableClick(request({ "user-agent": CHROME, ...headers }))).toBe(false);
  });
});
