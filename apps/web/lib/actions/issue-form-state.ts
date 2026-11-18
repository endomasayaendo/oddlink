import type { IssueState } from "@/lib/actions/issue-link";

type IssueFailure = Extract<NonNullable<IssueState>, { ok: false }>;

// The home page form's state: failures also carry the submitted URL so the input can be restored.
export type FormState = Exclude<IssueState, IssueFailure> | (IssueFailure & { submitted: string });

/** Adds the submitted URL to a failure; successes and null pass through unchanged. */
export function withSubmitted(state: IssueState, formData: FormData): FormState {
  if (state && !state.ok) {
    const submitted = formData.get("originalUrl");
    return { ...state, submitted: typeof submitted === "string" ? submitted : "" };
  }
  return state;
}
