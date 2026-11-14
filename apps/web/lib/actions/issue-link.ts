"use server";

import { type IssueResult, issueShortUrl } from "@/lib/links/issue-link";

type IssueFailure = Extract<IssueResult, { ok: false }>;
// Omit each member separately so `reason` survives on the failures that have one.
type WithoutStatus<T> = T extends unknown ? Omit<T, "status"> : never;

// Same as IssueResult minus the HTTP status, which only the API route needs.
export type IssueState = Extract<IssueResult, { ok: true }> | WithoutStatus<IssueFailure> | null;

export async function issueAction(_prev: IssueState, formData: FormData): Promise<IssueState> {
  const result = await issueShortUrl(formData.get("originalUrl"));
  // Rebuild the failure so `status` isn't serialized to the client.
  if (result.ok) return result;
  return "reason" in result
    ? { ok: false, reason: result.reason, message: result.message }
    : { ok: false, message: result.message };
}
