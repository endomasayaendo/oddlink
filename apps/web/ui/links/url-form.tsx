import { SAFE_BROWSING_NOTICE } from "@/lib/links/safe-browsing/advisory";

type Props = {
  action: (formData: FormData) => void;
  pending: boolean;
  defaultValue?: string;
};

export function UrlForm({ action, pending, defaultValue }: Props) {
  return (
    <div className="mb-6">
      <form action={action} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          name="originalUrl"
          placeholder="Enter your URL here..."
          defaultValue={defaultValue}
          required
          className="flex-1 rounded-lg border-2 border-[#e0e0e0] px-4 py-3 text-base transition-colors outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={pending}
          className="bg-brand-gradient w-full cursor-pointer rounded-lg px-6 py-3 text-base font-semibold text-white transition enabled:hover:-translate-y-px enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {pending ? "Shortening..." : "Shorten"}
        </button>
      </form>
      {/* Disclaimer Google's Safe Browsing terms ask for on sites that use the API. */}
      <p className="mt-2 text-[0.7rem] leading-snug text-[#999]">{SAFE_BROWSING_NOTICE}</p>
    </div>
  );
}
