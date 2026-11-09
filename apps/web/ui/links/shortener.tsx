"use client";

import { useActionState, useState } from "react";
import { issueAction, type IssueState } from "@/lib/actions/issue-link";
import { useHistory } from "@/ui/links/use-history";
import { ErrorMessage } from "@oddlink/ui";
import { HistoryList } from "./history-list";
import { ResultCard } from "./result-card";
import { UrlForm } from "./url-form";

type IssueFailure = Extract<NonNullable<IssueState>, { ok: false }>;

// Client-only: failures also carry the submitted URL so the input can be restored.
type FormState = Exclude<IssueState, IssueFailure> | (IssueFailure & { submitted: string });

export function Shortener() {
  const { history, addEntry, removeEntry } = useHistory();
  const [copyError, setCopyError] = useState("");
  const [dismissed, setDismissed] = useState<FormState>(null);

  const [state, formAction, pending] = useActionState(async (_prev: FormState, formData: FormData): Promise<FormState> => {
    setCopyError("");
    // The action ignores its previous state; pass null so the last submitted URL isn't sent back.
    const next = await issueAction(null, formData);
    if (next?.ok) addEntry({ shortCode: next.shortCode, shortUrl: next.shortUrl, originalUrl: next.originalUrl });
    // React resets the form after every action, so a failed submit would wipe the input unless
    // the value travels in the returned state and is fed back as the input's defaultValue.
    if (next && !next.ok) {
      const submitted = formData.get("originalUrl");
      return { ...next, submitted: typeof submitted === "string" ? submitted : "" };
    }
    return next;
  }, null);

  const error = copyError || (state && !state.ok && state !== dismissed ? state.message : "");

  return (
    <>
      <UrlForm action={formAction} pending={pending} defaultValue={state && !state.ok ? state.submitted : ""} />

      {error && (
        <ErrorMessage
          message={error}
          onDismiss={() => {
            setCopyError("");
            setDismissed(state);
          }}
        />
      )}

      {state?.ok && (
        <div className="flex justify-center">
          <ResultCard key={state.shortCode} shortCode={state.shortCode} shortUrl={state.shortUrl} onError={setCopyError} />
        </div>
      )}

      <HistoryList history={history} onRemove={removeEntry} />
    </>
  );
}
