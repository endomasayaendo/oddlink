import { z } from "zod";

// Only http(s): Java's @URL also accepted file:, ftp: and jar: links.
export const originalUrlSchema = z
  .string({ error: "URL is required" })
  .trim()
  .min(1, "URL is required")
  .max(2048, "URL is too long")
  .pipe(z.url({ protocol: /^https?$/, error: "Must be a valid http or https URL" }));
