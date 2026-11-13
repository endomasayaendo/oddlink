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
  return (
    <div className="w-fit max-w-full animate-fade-in-up rounded-wobble border-2 border-ink bg-mustard px-4 py-5 text-left text-ink sm:px-8 sm:py-7">
      <p className="mb-3 text-[0.8rem]">Your link just got odd:</p>
      <div className="flex flex-col items-start gap-4">
        <a
          href={shortUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="max-w-full font-hand text-[1.1rem] break-all text-ink sm:text-[1.6rem] sm:break-normal sm:whitespace-nowrap"
        >
          {shortUrl}
        </a>
        <div className="flex w-full gap-3 sm:w-auto">
          <Link
            href={`/analytics/${shortCode}`}
            className={`${buttonClass} flex-1 px-4 py-1.5 text-center text-[0.85rem] sm:flex-none`}
          >
            Analytics
          </Link>
          <button
            type="button"
            onClick={() => copy(shortUrl)}
            className={`${buttonClass} flex-1 px-4 py-1.5 text-[0.85rem] sm:flex-none`}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
