import { useId } from "react";
import { SAFE_BROWSING_NOTICE } from "@/lib/links/safe-browsing/advisory";
import { buttonClass } from "@/ui/shared/styles";

type Props = {
  action: (formData: FormData) => void;
  pending: boolean;
  defaultValue?: string;
};

export function UrlForm({ action, pending, defaultValue }: Props) {
  const inputId = useId();

  return (
    <div className="mb-6">
      <form action={action} className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor={inputId} className="sr-only">
          URL to shorten
        </label>
        <input
          id={inputId}
          type="url"
          name="originalUrl"
          placeholder="https://example.com/…"
          defaultValue={defaultValue}
          required
          className="flex-1 rounded-wobble border-2 border-ink bg-paper-light px-4 py-3 text-base text-ink placeholder:text-ink-muted"
        />
        <button type="submit" disabled={pending} className={`${buttonClass} w-full px-6 py-3 text-base sm:w-auto`}>
          {pending ? "Shortening..." : "Shorten"}
        </button>
      </form>
      {/* Disclaimer Google's Safe Browsing terms ask for on sites that use the API. */}
      <p className="mt-2 text-[0.75rem] leading-snug text-ink-muted">{SAFE_BROWSING_NOTICE}</p>
    </div>
  );
}
