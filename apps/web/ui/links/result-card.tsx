import { useState, useTransition } from "react";
import Link from "next/link";
import { useCopy } from "@oddlink/ui";
import { rerollAction } from "@/lib/actions/reroll-link";

export type IssuedLink = { shortCode: string; shortUrl: string; originalUrl: string };

type Props = {
  link: IssuedLink;
  /** Present right after issuing; lets the user reroll the phrase once. */
  rerollToken?: string;
  /** Shows a message in the page's error area; "" clears it. */
  onError: (message: string) => void;
  onRerolled: (previousShortCode: string, link: IssuedLink) => void;
};

const outlineButton =
  "flex-1 rounded-md border-2 border-brand bg-white px-3.5 py-1.5 text-center text-[0.8rem] font-semibold text-brand transition hover:bg-brand hover:text-white hover:no-underline sm:flex-none";

export function ResultCard({ link: issued, rerollToken, onError, onRerolled }: Props) {
  const { copied, copy } = useCopy(onError);
  const [link, setLink] = useState(issued);
  const [token, setToken] = useState(rerollToken);
  const [rerolled, setRerolled] = useState(false);
  const [rerolling, startReroll] = useTransition();

  const reroll = (currentToken: string) => {
    onError("");
    startReroll(async () => {
      const result = await rerollAction(currentToken);
      if (result.ok) {
        const next = { shortCode: result.shortCode, shortUrl: result.shortUrl, originalUrl: result.originalUrl };
        onRerolled(link.shortCode, next);
        setLink(next);
        setToken(undefined);
        setRerolled(true);
      } else {
        if (!result.canRetry) setToken(undefined);
        onError(result.message);
      }
    });
  };

  return (
    <div className="w-fit max-w-full animate-fade-in-up rounded-xl border-2 border-brand bg-white px-4 py-5 shadow-[0_4px_20px_rgba(102,126,234,0.15)] sm:px-8 sm:py-7">
      <p className="mb-4 text-left font-typewriter text-[0.9rem] text-brand">Your link just got odd:</p>
      <div className="flex flex-col items-start gap-4">
        <a
          href={link.shortUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="max-w-full font-typewriter text-[0.85rem] break-all text-ink hover:text-brand sm:text-[1.4rem] sm:break-normal sm:whitespace-nowrap"
        >
          {link.shortUrl}
        </a>
        <div className="flex w-full gap-2 sm:w-auto">
          <Link href={`/analytics/${link.shortCode}`} className={outlineButton}>
            Analytics
          </Link>
          <button
            type="button"
            onClick={() => copy(link.shortUrl)}
            className="bg-brand-gradient flex-1 cursor-pointer rounded-md px-3.5 py-1.5 text-[0.8rem] font-semibold text-white transition-opacity hover:opacity-85 sm:flex-none"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          {token && (
            <button
              type="button"
              onClick={() => reroll(token)}
              disabled={rerolling}
              title="Get a different phrase for this link. The current link stops working right away."
              aria-describedby="reroll-note"
              className={`${outlineButton} cursor-pointer disabled:cursor-wait disabled:opacity-60`}
            >
              {rerolling ? "Rerolling..." : "Reroll"}
            </button>
          )}
        </div>
        {token && (
          <p id="reroll-note" className="text-left text-xs text-[#999]">
            Not your phrase? Reroll once within 5 minutes. The current link will stop working.
          </p>
        )}
        {rerolled && (
          <p role="status" className="text-left text-xs text-[#999]">
            Rerolled. The previous link no longer works, and this was your one reroll.
          </p>
        )}
      </div>
    </div>
  );
}
