"use client";

import { useActionState, useState } from "react";
import { issueAction, type IssueState } from "@/app/actions";
import { useHistory } from "@/hooks/useHistory";
import { ErrorMessage } from "./ErrorMessage";
import { HistoryList } from "./HistoryList";
import { ResultCard } from "./ResultCard";
import { UrlForm } from "./UrlForm";

export function Shortener() {
  const { history, addEntry, removeEntry } = useHistory();
  const [copyError, setCopyError] = useState("");
  const [dismissed, setDismissed] = useState<IssueState>(null);

  const [state, formAction, pending] = useActionState(async (prev: IssueState, formData: FormData) => {
    setCopyError("");
    const next = await issueAction(prev, formData);
    if (next?.ok) addEntry({ shortCode: next.shortCode, shortUrl: next.shortUrl, originalUrl: next.originalUrl });
    return next;
  }, null);

  const error = copyError || (state && !state.ok && state !== dismissed ? state.message : "");

  return (
    <>
      <UrlForm action={formAction} pending={pending} />

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
          <ResultCard shortCode={state.shortCode} shortUrl={state.shortUrl} onError={setCopyError} />
        </div>
      )}

      <HistoryList history={history} onRemove={removeEntry} />
    </>
  );
}
