type Props = {
  message: string;
  onDismiss: () => void;
  /**
   * Extra classes for the root, typically outer spacing. Defaults to `mb-6`;
   * passing a value replaces that default rather than adding to it.
   */
  className?: string;
};

export function ErrorMessage({ message, onDismiss, className = "mb-6" }: Props) {
  return (
    <div
      role="alert"
      className={`flex animate-fade-in-down items-center gap-3 rounded-wobble border-2 border-rust bg-rust-wash px-4 py-3.5 ${className}`}
    >
      <span className="flex-1 text-left text-[0.9rem] text-rust">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Close"
        className="cursor-pointer text-xl leading-none text-rust transition-colors hover:text-rust-deep"
      >
        &times;
      </button>
    </div>
  );
}
