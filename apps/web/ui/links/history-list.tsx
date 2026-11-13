import { useState } from "react";
import Link from "next/link";
import { ErrorMessage, useCopy } from "@oddlink/ui";
import type { HistoryEntry } from "@/ui/links/use-history";

type Props = {
  history: HistoryEntry[];
  onRemove: (shortCode: string) => void;
};

const actionClass = "cursor-pointer text-xs whitespace-nowrap text-ink-muted transition-colors hover:text-tomato-deep hover:no-underline";

function HistoryItem({ entry, onRemove }: { entry: HistoryEntry; onRemove: (shortCode: string) => void }) {
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
          <Link href={`/analytics/${entry.shortCode}`} className={actionClass}>
            Analytics
          </Link>
          <button
            type="button"
            onClick={() => {
              setCopyError("");
              copy(entry.shortUrl);
            }}
            className={actionClass}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <button
            type="button"
            onClick={() => onRemove(entry.shortCode)}
            aria-label="Remove"
            className="ml-4 cursor-pointer text-base leading-none text-ink-muted transition-colors hover:text-tomato-deep"
          >
            ×
          </button>
        </div>
      </div>
      {copyError && <ErrorMessage message={copyError} onDismiss={() => setCopyError("")} className="mt-2" />}
    </li>
  );
}

export function HistoryList({ history, onRemove }: Props) {
  if (history.length === 0) return null;

  return (
    <div className="mt-8 animate-fade-in-up text-left">
      <p className="mb-2 text-xs font-semibold tracking-wider text-ink-muted uppercase">Recent links</p>
      <ul>
        {history.map((entry) => (
          <HistoryItem key={entry.shortCode} entry={entry} onRemove={onRemove} />
        ))}
      </ul>
    </div>
  );
}
