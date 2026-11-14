import Link from "next/link";
import { useCopy } from "@oddlink/ui";
import { buttonClass } from "@/ui/shared/styles";

type Props = {
  shortCode: string;
  shortUrl: string;
  onError: (message: string) => void;
};

export function ResultCard({ shortCode, shortUrl, onError }: Props) {
  const { copied, copy } = useCopy(onError);

  // Everything on the mustard card stays ink: tomato text on mustard falls below AA.
  // Nothing on the card is quite level: the card leans one way, the URL another, and the label
  // and buttons sit a little off. Only `rotate`/margins are used, so the fade-in's `transform`
  // still plays, and the tilts are small enough that the URL reads, wraps and clicks as before.
  return (
    <div className="w-fit max-w-full -rotate-[1.5deg] animate-fade-in-up rounded-wobble border-2 border-ink bg-mustard px-4 py-5 text-left text-ink shadow-[5px_6px_0_var(--color-ink-strong)] sm:-rotate-[2.2deg] sm:px-8 sm:py-7">
      <p className="mb-3 ml-1 rotate-[1.2deg] text-[0.8rem]">Your link just got odd:</p>
      <div className="flex flex-col items-start gap-4">
        <a
          href={shortUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="max-w-full rotate-[1.8deg] font-hand text-[1.1rem] break-all text-ink sm:ml-2 sm:rotate-[2.6deg] sm:text-[1.6rem] sm:break-normal sm:whitespace-nowrap"
        >
          {shortUrl}
        </a>
        <div className="flex w-full items-start gap-3 sm:w-auto">
          <Link
            href={`/analytics/${shortCode}`}
            className={`${buttonClass} mt-1 flex-1 rotate-1 px-4 py-1.5 text-center text-[0.85rem] sm:flex-none`}
          >
            Analytics
          </Link>
          <button
            type="button"
            onClick={() => copy(shortUrl)}
            className={`${buttonClass} flex-1 -rotate-2 px-4 py-1.5 text-[0.85rem] sm:flex-none`}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
