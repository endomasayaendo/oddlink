import { unstable_rethrow } from "next/navigation";
import type { IssueState } from "@/lib/actions/issue-link";

type IssueFailure = Extract<NonNullable<IssueState>, { ok: false }>;

// Client-only: failures also carry the submitted URL so the input can be restored.
export type FormState = Exclude<IssueState, IssueFailure> | (IssueFailure & { submitted: string });

type IssueActionFn = (prev: IssueState, formData: FormData) => Promise<IssueState>;

// The Server Action call itself can reject: offline, a deploy that changed the action ID, a crash,
// or an edge response that isn't RSC (a WAF 429 deny page). Next.js turns those into a plain
// Error with no status, so a WAF rate limit can't be told apart reliably and gets this message too.
export const ACTION_FAILED_MESSAGE = "Something went wrong. Please try again.";

/**
 * Calls the issue action and never throws. A rejection becomes an ordinary failure state, so it
 * doesn't reach the error boundary and wipe the form and history; the submitted URL rides along
 * either way because React resets the form after every action.
 */
export async function submitIssue(action: IssueActionFn, formData: FormData): Promise<FormState> {
  let next: IssueState;
  try {
    // The action ignores its previous state; pass null so the last submitted URL isn't sent back.
    next = await action(null, formData);
  } catch (error) {
    // A redirect() or notFound() from the action also arrives as a rejection; let Next.js handle it.
    unstable_rethrow(error);
    console.error(error);
    next = { ok: false, message: ACTION_FAILED_MESSAGE };
  }
  if (next && !next.ok) {
    const submitted = formData.get("originalUrl");
    return { ...next, submitted: typeof submitted === "string" ? submitted : "" };
  }
  return next;
}
