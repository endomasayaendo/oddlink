"use client";

import { useActionState, useState } from "react";
import { issueAction } from "@/lib/actions/issue-link";
import { useHistory } from "@/ui/links/use-history";
import { ErrorMessage } from "@oddlink/ui";
import {
  ADVISORY_TEXT,
  ADVISORY_URL,
  MALWARE_INFO_URL,
  SOCIAL_ENGINEERING_INFO_URL,
} from "@/lib/links/safe-browsing/advisory";
import { FlipOverlay } from "./flip-overlay";
import { HistoryList } from "./history-list";
import { ResultCard } from "./result-card";
import { type FormState, submitIssue } from "./submit-issue";
import { UrlForm } from "./url-form";

export function Shortener() {
  const { history, addEntry, removeEntry } = useHistory();
  const [copyError, setCopyError] = useState("");
  const [dismissed, setDismissed] = useState<FormState>(null);

  const [state, formAction, pending] = useActionState(async (_prev: FormState, formData: FormData): Promise<FormState> => {
    setCopyError("");
    // React resets the form after every action, so a failed submit (including one where the action
    // call itself rejects) carries the input back in the state, fed back as the defaultValue.
    const next = await submitIssue(issueAction, formData);
    if (next?.ok) addEntry({ shortCode: next.shortCode, shortUrl: next.shortUrl, originalUrl: next.originalUrl });
    return next;
  }, null);

  const error = copyError || (state && !state.ok && state !== dismissed ? state.message : "");
  const showAdvisory = !copyError && !!state && !state.ok && state !== dismissed && state.reason === "unsafe_url";

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
        >
          {showAdvisory && <UnsafeUrlAdvisory />}
        </ErrorMessage>
      )}

      {/* Keyed by code: the page turns over once per issued link, never on failures or history edits. */}
      {state?.ok && <FlipOverlay key={state.shortCode} />}

      {/* Rendered from the start so screen readers are already watching it when progress or a result
          appears; removals (a failed retry clearing the card) are not announced, the alert covers those. */}
      <div role="status" className="flex justify-center">
        {pending && <span className="sr-only">Shortening...</span>}
        {state?.ok && (
          <ResultCard key={state.shortCode} shortCode={state.shortCode} shortUrl={state.shortUrl} onError={setCopyError} />
        )}
      </div>

      <HistoryList history={history} onRemove={removeEntry} />
    </>
  );
}

const linkClass = "underline underline-offset-2 hover:text-rust-deep";

// Google's Safe Browsing terms require the attribution and a link to learn more next to a warning.
function UnsafeUrlAdvisory() {
  return (
    <span className="mt-1 block text-[0.8rem]">
      <a href={ADVISORY_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
        {ADVISORY_TEXT}
      </a>
      {" · Learn more about "}
      <a href={SOCIAL_ENGINEERING_INFO_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
        phishing
      </a>
      {" and "}
      <a href={MALWARE_INFO_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
        malware
      </a>
    </span>
  );
}
