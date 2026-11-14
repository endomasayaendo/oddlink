"use client";

import { useActionState, useState } from "react";
import { issueAction, type IssueState } from "@/lib/actions/issue-link";
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

      {state?.ok && (
        <div className="flex justify-center">
          <ResultCard key={state.shortCode} shortCode={state.shortCode} shortUrl={state.shortUrl} onError={setCopyError} />
        </div>
      )}

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
