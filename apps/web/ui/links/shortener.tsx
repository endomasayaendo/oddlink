"use client";

import { useActionState, useState } from "react";
import { issueAction, type IssueState } from "@/lib/actions/issue-link";
import { useHistory } from "@/ui/links/use-history";
import { ErrorMessage } from "@oddlink/ui";
import { HistoryList } from "./history-list";
import { ResultCard } from "./result-card";
import { UrlForm } from "./url-form";

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
