"use server";

import { headers } from "next/headers";
import { type IssueResult, issueShortUrl } from "@/lib/links/issue-link";
import { getClientIp } from "@/lib/rate-limit/client-key";

type IssueFailure = Extract<IssueResult, { ok: false }>;
// Omit each member separately so `reason` survives on the failures that have one.
type WithoutStatus<T> = T extends unknown ? Omit<T, "status"> : never;

// Same as IssueResult minus the HTTP status, which only the API route needs.
export type IssueState = Extract<IssueResult, { ok: true }> | WithoutStatus<IssueFailure> | null;

export async function issueAction(_prev: IssueState, formData: FormData): Promise<IssueState> {
  const clientIp = getClientIp(await headers());
  const result = await issueShortUrl(formData.get("originalUrl"), { clientIp });
  // Rebuild the failure so `status` isn't serialized to the client.
  if (result.ok) return result;
  switch (result.status) {
    case 422:
      return { ok: false, reason: result.reason, message: result.message };
    case 429:
      return { ok: false, reason: result.reason, message: result.message, retryAfterSeconds: result.retryAfterSeconds };
    default:
      return { ok: false, message: result.message };
  }
}
