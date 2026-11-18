import { useId } from "react";
import { buttonClass } from "@/ui/shared/styles";

type Props = {
  action: (formData: FormData) => void;
  pending: boolean;
  defaultValue?: string;
  /** Id of the error that explains why the last submit failed, read out as the input's description. */
  errorId?: string;
};

export function UrlForm({ action, pending, defaultValue, errorId }: Props) {
  const inputId = useId();

  return (
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
        aria-describedby={errorId}
        className="flex-1 rounded-wobble border-2 border-ink bg-paper-light px-4 py-3 text-base text-ink placeholder:text-ink-muted"
      />
      <button type="submit" disabled={pending} className={`${buttonClass} w-full px-6 py-3 text-base sm:w-auto`}>
        {pending ? "Shortening..." : "Shorten"}
      </button>
    </form>
  );
}
