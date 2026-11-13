import { buttonClass } from "@/ui/shared/styles";

type Props = {
  action: (formData: FormData) => void;
  pending: boolean;
  defaultValue?: string;
};

export function UrlForm({ action, pending, defaultValue }: Props) {
  return (
    <form action={action} className="mb-6 flex flex-col gap-3 sm:flex-row">
      <input
        type="url"
        name="originalUrl"
        placeholder="Enter your URL here..."
        defaultValue={defaultValue}
        required
        className="flex-1 rounded-wobble border-2 border-ink bg-paper-light px-4 py-3 text-base text-ink placeholder:text-ink-muted"
      />
      <button type="submit" disabled={pending} className={`${buttonClass} w-full px-6 py-3 text-base sm:w-auto`}>
        {pending ? "Shortening..." : "Shorten"}
      </button>
    </form>
  );
}
