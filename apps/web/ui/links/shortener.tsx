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
  const { history, addEntry, removeEntry, replaceEntry } = useHistory();
  // Errors from the result card (copy, reroll).
  const [cardError, setCardError] = useState("");
  const [dismissed, setDismissed] = useState<FormState>(null);

  const [state, formAction, pending] = useActionState(async (_prev: FormState, formData: FormData): Promise<FormState> => {
    setCardError("");
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

  const error = cardError || (state && !state.ok && state !== dismissed ? state.message : "");

  return (
    <>
      <UrlForm action={formAction} pending={pending} defaultValue={state && !state.ok ? state.submitted : ""} />

      {error && (
        <ErrorMessage
          message={error}
          onDismiss={() => {
            setCardError("");
            setDismissed(state);
          }}
        />
      )}

      {state?.ok && (
        <div className="flex justify-center">
          {/* Keyed by the issued code, so a reroll (which changes the code inside the card) keeps it mounted. */}
          <ResultCard
            key={state.shortCode}
            link={{ shortCode: state.shortCode, shortUrl: state.shortUrl, originalUrl: state.originalUrl }}
            rerollToken={state.rerollToken}
            rerollExpiresAt={state.rerollExpiresAt}
            onError={setCardError}
            onRerolled={replaceEntry}
          />
        </div>
      )}

      <HistoryList history={history} onRemove={removeEntry} />
    </>
  );
}
