"use server";

import { issueShortUrl } from "@/lib/links/issue-link";

export type IssueState =
  | { ok: true; shortCode: string; shortUrl: string; originalUrl: string }
  | { ok: false; message: string }
  | null;

export async function issueAction(_prev: IssueState, formData: FormData): Promise<IssueState> {
  const result = await issueShortUrl(formData.get("originalUrl"));
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, shortCode: result.shortCode, shortUrl: result.shortUrl, originalUrl: result.originalUrl };
}
