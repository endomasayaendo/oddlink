import Link from "next/link";
import { useCopy } from "@oddlink/ui";
import type { HistoryEntry } from "@/ui/links/use-history";

type Props = {
  history: HistoryEntry[];
  onRemove: (shortCode: string) => void;
};

function truncate(url: string, max: number): string {
  return url.length > max ? url.slice(0, max) + "…" : url;
}

const actionClass = "cursor-pointer text-xs whitespace-nowrap text-[#aaa] transition-colors hover:text-brand hover:no-underline";

function HistoryItem({ entry, onRemove }: { entry: HistoryEntry; onRemove: (shortCode: string) => void }) {
  const { copied, copy } = useCopy();

  return (
    <li className="flex flex-col items-start gap-1.5 border-b border-[#ebebeb] py-3 first:border-t sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-2.5">
      <div className="flex w-full flex-1 flex-col gap-0.5 overflow-hidden">
        <a
          href={entry.shortUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate text-[0.8rem] font-medium text-[#555] hover:text-brand"
        >
          {entry.shortUrl}
        </a>
        <span className="truncate text-[0.7rem] text-[#bbb]">{truncate(entry.originalUrl, 50)}</span>
      </div>
      <div className="flex w-full shrink-0 items-center gap-3 sm:w-auto">
        <Link href={`/analytics/${entry.shortCode}`} className={actionClass}>
          Analytics
        </Link>
        <button type="button" onClick={() => copy(entry.shortUrl)} className={actionClass}>
          {copied ? "Copied!" : "Copy"}
        </button>
        <button
          type="button"
          onClick={() => onRemove(entry.shortCode)}
          aria-label="Remove"
          className="ml-4 cursor-pointer text-base leading-none text-[#ddd] transition-colors hover:text-[#aaa]"
        >
          ×
        </button>
      </div>
    </li>
  );
}

export function HistoryList({ history, onRemove }: Props) {
  if (history.length === 0) return null;

  return (
    <div className="mt-8 animate-fade-in-up text-left">
      <p className="mb-2 text-xs font-semibold tracking-wider text-[#bbb] uppercase">Recent links</p>
      <ul>
        {history.map((entry) => (
          <HistoryItem key={entry.shortCode} entry={entry} onRemove={onRemove} />
        ))}
      </ul>
    </div>
  );
}
