import { z } from "zod";
import { hasUserinfo } from "@/lib/links/url-safety";

export const NO_USERINFO_MESSAGE = "URLs with a username or password are not allowed";

// Only http(s): Java's @URL also accepted file:, ftp: and jar: links.
export const originalUrlSchema = z
  .string({ error: "URL is required" })
  .trim()
  .min(1, "URL is required")
  .max(2048, "URL is too long")
  .pipe(z.url({ protocol: /^https?$/, error: "Must be a valid http or https URL" }))
  // A separate pipe stage: a refine chained on z.url() still runs after the URL check fails,
  // so `new URL()` would throw on garbage input and a second issue would be reported.
  .pipe(z.string().refine((value) => !hasUserinfo(new URL(value)), NO_USERINFO_MESSAGE));
