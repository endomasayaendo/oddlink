"use server";

import { type IssueResult, issueShortUrl } from "@/lib/links/issue-link";

type IssueFailure = Extract<IssueResult, { ok: false }>;

// Same as IssueResult minus the HTTP status, which only the API route needs.
export type IssueState = Extract<IssueResult, { ok: true }> | Omit<IssueFailure, "status"> | null;

export async function issueAction(_prev: IssueState, formData: FormData): Promise<IssueState> {
  const result = await issueShortUrl(formData.get("originalUrl"));
  // Rebuild the failure so `status` isn't serialized to the client.
  return result.ok ? result : { ok: false, message: result.message };
}
