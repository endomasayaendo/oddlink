// Small original decorations for the storybook look. Purely visual, so hidden from assistive tech.

type DecorProps = { className?: string };

/** A sun that, on a second look, has an eye. */
export function EyedSun({ className = "" }: DecorProps) {
  return (
    <svg aria-hidden="true" width="34" height="34" viewBox="0 0 34 34" className={`pointer-events-none ${className}`}>
      <circle cx="17" cy="17" r="12" className="fill-mustard stroke-ink" strokeWidth="2" />
      <ellipse cx="17" cy="17" rx="5" ry="3.2" className="fill-paper-light stroke-ink" strokeWidth="1.5" />
      <circle cx="17.6" cy="17" r="1.6" className="fill-ink" />
    </svg>
  );
}

/** A faint tea-colored stain on the paper. */
export function Stain({ className = "" }: DecorProps) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none h-[46px] w-[70px] rounded-full bg-[radial-gradient(ellipse_at_40%_40%,rgba(130,70,40,0.22),rgba(130,70,40,0.08)_60%,transparent_70%)] ${className}`}
    />
  );
}
