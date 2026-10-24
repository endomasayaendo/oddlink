type Props = {
  message: string;
  onDismiss: () => void;
};

export function ErrorMessage({ message, onDismiss }: Props) {
  return (
    <div className="mb-6 flex animate-fade-in-down items-center gap-3 rounded-lg border border-[#feb2b2] bg-[#fff5f5] px-4 py-3.5">
      <span className="flex-1 text-left text-[0.9rem] text-[#c53030]">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Close"
        className="cursor-pointer text-xl leading-none text-[#c53030] opacity-60 transition-opacity hover:opacity-100"
      >
        &times;
      </button>
    </div>
  );
}
