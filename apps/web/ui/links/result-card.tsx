import Link from "next/link";
import { useCopy } from "@oddlink/ui";

type Props = {
  shortCode: string;
  shortUrl: string;
  onError: (message: string) => void;
};

export function ResultCard({ shortCode, shortUrl, onError }: Props) {
  const { copied, copy } = useCopy(onError);

  return (
    <div className="w-fit max-w-full animate-fade-in-up rounded-xl border-2 border-brand bg-white px-4 py-5 shadow-[0_4px_20px_rgba(102,126,234,0.15)] sm:px-8 sm:py-7">
      <p className="mb-4 text-left font-typewriter text-[0.9rem] text-brand">Your link just got odd:</p>
      <div className="flex flex-col items-start gap-4">
        <a
          href={shortUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="max-w-full font-typewriter text-[0.85rem] break-all text-ink hover:text-brand sm:text-[1.4rem] sm:break-normal sm:whitespace-nowrap"
        >
          {shortUrl}
        </a>
        <div className="flex w-full gap-2 sm:w-auto">
          <Link
            href={`/analytics/${shortCode}`}
            className="flex-1 rounded-md border-2 border-brand bg-white px-3.5 py-1.5 text-center text-[0.8rem] font-semibold text-brand transition hover:bg-brand hover:text-white hover:no-underline sm:flex-none"
          >
            Analytics
          </Link>
          <button
            type="button"
            onClick={() => copy(shortUrl)}
            className="bg-brand-gradient flex-1 cursor-pointer rounded-md px-3.5 py-1.5 text-[0.8rem] font-semibold text-white transition-opacity hover:opacity-85 sm:flex-none"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
