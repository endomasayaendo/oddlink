type Props = {
  action: (formData: FormData) => void;
  pending: boolean;
};

export function UrlForm({ action, pending }: Props) {
  return (
    <form action={action} className="mb-6 flex flex-col gap-2 sm:flex-row">
      <input
        type="url"
        name="originalUrl"
        placeholder="Enter your URL here..."
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
  );
}
