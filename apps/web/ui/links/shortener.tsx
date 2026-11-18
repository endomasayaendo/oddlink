"use client";

import { useActionState, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { issueAction, issueFormAction } from "@/lib/actions/issue-link";
import { useHistory } from "@/ui/links/use-history";
import { ErrorMessage } from "@oddlink/ui";
import {
  ADVISORY_TEXT,
  ADVISORY_URL,
  MALWARE_INFO_URL,
  SAFE_BROWSING_NOTICE,
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
  const errorId = useId();

  const submitInBrowser = async (_prev: FormState, formData: FormData): Promise<FormState> => {
    setCopyError("");
    // React resets the form after every action, so a failed submit (including one where the action
    // call itself rejects) carries the input back in the state, fed back as the defaultValue.
    return submitIssue(issueAction, formData);
  };

  // Until hydration the hook gets the Server Action itself, so the server-rendered form posts to it:
  // a submit before hydration (or without JavaScript) reloads the page with the action's result as
  // the state. Once hydrated, the wrapper above handles submits and never throws.
  const hydrated = useSyncExternalStore(noSubscribe, isHydrated, isNotHydrated);
  const [state, formAction, pending] = useActionState(hydrated ? submitInBrowser : issueFormAction, null);

  // Recorded from the state rather than inside the action, so a result rendered from a form post
  // before hydration is saved too once the page hydrates.
  const recorded = useRef<FormState>(null);
  useEffect(() => {
    if (!state?.ok || recorded.current === state) return;
    recorded.current = state;
    addEntry({ shortCode: state.shortCode, shortUrl: state.shortUrl, originalUrl: state.originalUrl });
  }, [state, addEntry]);

  const submitError = state && !state.ok && state !== dismissed ? state.message : "";
  const error = copyError || submitError;
  const showAdvisory = !copyError && !!submitError && state?.ok === false && state.reason === "unsafe_url";

  return (
    <>
      {/* The error and the result sit right under the form and above the notice, so on a narrow
          screen they appear next to the input instead of below the fold. */}
      <div className="mb-6">
        <UrlForm
          action={formAction}
          pending={pending}
          defaultValue={state && !state.ok ? state.submitted : ""}
          errorId={submitError && !copyError ? errorId : undefined}
        />

        {error && (
          <ErrorMessage
            message={error}
            messageId={errorId}
            className="mt-3"
            onDismiss={() => {
              setCopyError("");
              setDismissed(state);
            }}
          >
            {showAdvisory && <UnsafeUrlAdvisory />}
          </ErrorMessage>
        )}

        {/* Rendered from the start so screen readers are already watching it when progress or a result
            appears; removals (a failed retry clearing the card) are not announced, the alert covers those. */}
        <div role="status" className="flex justify-center">
          {pending && <span className="sr-only">Shortening...</span>}
          {state?.ok && (
            <div className="mt-6 mb-4">
              <ResultCard key={state.shortCode} shortCode={state.shortCode} shortUrl={state.shortUrl} onError={setCopyError} />
            </div>
          )}
        </div>

        {/* Disclaimer Google's Safe Browsing terms ask for on sites that use the API. */}
        <p className="mt-2 text-[0.75rem] leading-snug text-ink-muted">{SAFE_BROWSING_NOTICE}</p>
      </div>

      {/* Keyed by code: the page turns over once per issued link, never on failures or history edits. */}
      {state?.ok && <FlipOverlay key={state.shortCode} />}

      <HistoryList history={history} onRemove={removeEntry} />
    </>
  );
}

const noSubscribe = () => () => {};
const isHydrated = () => true;
const isNotHydrated = () => false;

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
