import { getEnv } from "@/lib/env";
import packageJson from "@/package.json";
import { createSafeBrowsingClient, type SafetyVerdict } from "./client";

export type { SafetyVerdict } from "./client";

let client: ReturnType<typeof createSafeBrowsingClient> | undefined;
let warnedSkipped = false;

/**
 * Checks a validated http(s) URL against Google Safe Browsing. "unknown" means the check could not
 * be done (no key, timeout, error) and callers fail open. Production always has a key (lib/env.ts).
 */
export async function checkUrlSafety(url: string): Promise<SafetyVerdict> {
  const apiKey = getEnv().SAFE_BROWSING_API_KEY;
  if (!apiKey) {
    if (!warnedSkipped) {
      warnedSkipped = true;
      console.warn("safe_browsing outcome=skipped", { reason: "SAFE_BROWSING_API_KEY is not set" });
    }
    return "unknown";
  }
  client ??= createSafeBrowsingClient({ apiKey, userAgent: `oddlink/${packageJson.version}` });
  return client.check(url);
}
