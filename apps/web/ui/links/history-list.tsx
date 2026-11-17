import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ErrorMessage, useCopy } from "@oddlink/ui";
import type { HistoryEntry } from "@/ui/links/use-history";

type Props = {
  history: HistoryEntry[];
  onRemove: (shortCode: string) => void;
};

// min-h-6 gives a 24px-tall target; -my-1 keeps the row as tall as the 16px text line it replaces.
const actionClass =
  "-my-1 inline-flex min-h-6 min-w-6 cursor-pointer items-center justify-center text-xs whitespace-nowrap text-ink-muted transition-colors hover:text-tomato-deep hover:no-underline";

type ItemProps = {
  entry: HistoryEntry;
  onRemove: () => void;
};

function HistoryItem({ entry, onRemove }: ItemProps) {
  const [copyError, setCopyError] = useState("");
  const { copied, copy } = useCopy(setCopyError);

  return (
    <li className="border-b border-ink/20 py-3 first:border-t sm:py-2.5">
      <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex w-full min-w-0 flex-1 flex-col gap-0.5">
          <a
            href={entry.shortUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-[0.8rem] font-medium text-ink hover:text-tomato-deep"
          >
            {entry.shortUrl}
          </a>
          <span className="truncate text-[0.7rem] text-ink-muted" title={entry.originalUrl}>
            {entry.originalUrl}
          </span>
        </div>
        <div className="flex w-full shrink-0 items-center gap-3 sm:w-auto">
          <Link href={`/analytics/${entry.shortCode}`} aria-label={`Analytics for ${entry.shortCode}`} className={actionClass}>
            Analytics
          </Link>
          <button
            type="button"
            onClick={() => {
              setCopyError("");
              copy(entry.shortUrl);
            }}
            aria-label={`${copied ? "Copied" : "Copy"} ${entry.shortCode}`}
            className={actionClass}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${entry.shortCode}`}
            data-remove={entry.shortCode}
            className="-my-1 ml-2.5 inline-flex min-h-6 min-w-6 cursor-pointer items-center justify-center text-base leading-none text-ink-muted transition-colors hover:text-tomato-deep"
          >
            ×
          </button>
        </div>
      </div>
      {copyError && <ErrorMessage message={copyError} onDismiss={() => setCopyError("")} className="mt-2" />}
    </li>
  );
}

type PendingFocus = { removed: string; next: string | null };

export function HistoryList({ history, onRemove }: Props) {
  const headingId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef<PendingFocus | null>(null);
  // Set once the user removes the last entry, so the heading stays as a focus target.
  const [emptied, setEmptied] = useState(false);

  // After a removal lands, move focus to the neighbouring row's Remove button, or to the heading
  // when no rows are left, instead of letting it fall back to the body with the removed row.
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending || history.some((e) => e.shortCode === pending.removed)) return;
    pendingFocus.current = null;
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-remove]") ?? [];
    const target = Array.from(buttons).find((b) => b.dataset.remove === pending.next);
    (target ?? buttons[0] ?? headingRef.current)?.focus();
  }, [history]);

  const remove = (index: number) => {
    const entry = history[index];
    const next = history[index + 1] ?? history[index - 1];
    pendingFocus.current = { removed: entry.shortCode, next: next?.shortCode ?? null };
    if (!next) setEmptied(true);
    onRemove(entry.shortCode);
  };

  if (history.length === 0 && !emptied) return null;

  return (
    <section aria-labelledby={headingId} className="mt-8 animate-fade-in-up text-left">
      <h2
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="mb-2 text-xs font-semibold tracking-wider text-ink-muted uppercase"
      >
        Recent links
      </h2>
      {history.length === 0 ? (
        <p className="text-[0.7rem] text-ink-muted">No recent links.</p>
      ) : (
        <ul ref={listRef}>
          {history.map((entry, index) => (
            <HistoryItem key={entry.shortCode} entry={entry} onRemove={() => remove(index)} />
          ))}
        </ul>
      )}
    </section>
  );
}
