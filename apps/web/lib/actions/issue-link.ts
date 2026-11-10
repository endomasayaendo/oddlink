"use server";

import { type IssueResult, issueShortUrl } from "@/lib/links/issue-link";
import { issueRerollToken } from "@/lib/links/reroll-token";

type IssueFailure = Extract<IssueResult, { ok: false }>;

export type IssueSuccess = {
  ok: true;
  shortCode: string;
  shortUrl: string;
  originalUrl: string;
  /** Lets this page reroll the phrase once (see rerollAction). Client state only; never stored. */
  rerollToken: string;
  /** When the token stops working, in epoch milliseconds. The UI hides the button then; the server still decides. */
  rerollExpiresAt: number;
};

// The HTTP status only matters to the API route, and the row id stays inside the token.
export type IssueState = IssueSuccess | Omit<IssueFailure, "status"> | null;

export async function issueAction(_prev: IssueState, formData: FormData): Promise<IssueState> {
  const result = await issueShortUrl(formData.get("originalUrl"));
  if (!result.ok) return { ok: false, message: result.message };
  const { id, shortCode, shortUrl, originalUrl } = result;
  const { token: rerollToken, expiresAt: rerollExpiresAt } = issueRerollToken({ id, code: shortCode });
  return { ok: true, shortCode, shortUrl, originalUrl, rerollToken, rerollExpiresAt };
}
