// Small original decorations for the storybook look. Purely visual, so hidden from assistive tech.
// Anything that moves stops under prefers-reduced-motion and rests in its normal pose.

type DecorProps = { className?: string };

// SVG parts scale and translate around their own box, not the canvas origin.
const ownBox = "[transform-box:fill-box]";

// Sun rays as [angle in degrees, length]; the one at 200deg hangs a little too long.
const RAYS: [number, number][] = [
  [0, 7], [45, 6], [90, 7], [135, 6], [200, 11], [225, 6], [270, 7], [315, 6],
];

/** A sun that, on a second look, has an eye. Now and then it blinks, and the eye wanders. */
export function EyedSun({ className = "" }: DecorProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 64 64" className={`pointer-events-none size-14 sm:size-20 ${className}`}>
      <g className="stroke-ink" strokeWidth="2" strokeLinecap="round">
        {RAYS.map(([angle, length]) => {
          const rad = (angle * Math.PI) / 180;
          const r1 = 22;
          const r2 = r1 + length;
          return (
            <line
              key={angle}
              x1={32 + r1 * Math.cos(rad)}
              y1={32 + r1 * Math.sin(rad)}
              x2={32 + r2 * Math.cos(rad) + (angle === 200 ? 1.5 : 0)}
              y2={32 + r2 * Math.sin(rad) + (angle === 200 ? 2 : 0)}
            />
          );
        })}
      </g>
      <circle cx="32" cy="32" r="17" className="fill-mustard stroke-ink" strokeWidth="2" />
      <g className={`${ownBox} origin-center animate-blink motion-reduce:animate-none`}>
        <ellipse cx="32" cy="32" rx="8" ry="5" className="fill-paper-light stroke-ink" strokeWidth="1.5" />
        <circle cx="33" cy="32" r="2.6" className="fill-ink animate-eye-drift motion-reduce:animate-none" />
      </g>
    </svg>
  );
}

/** A low, sickly sun with its eye half shut, sinking into the A-2 fog. */
export function HalfLidSun({ className = "" }: DecorProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 64 64" className={`pointer-events-none ${className}`}>
      <circle cx="32" cy="32" r="22" fill="#d9c58f" className="stroke-ink" strokeWidth="2" strokeOpacity="0.6" />
      <ellipse cx="32" cy="34" rx="10" ry="6" className="fill-paper-light stroke-ink" strokeWidth="1.5" />
      <circle cx="31" cy="37" r="3" className="fill-ink" />
      {/* The heavy lid, drawn over the top half of the eye. */}
      <path d="M21.5 34 Q32 22 42.5 34 Q32 31 21.5 34Z" fill="#c9b37a" className="stroke-ink" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * A faint tea-colored stain on the paper. It sits behind text on narrow screens (the history
 * list), so the peak stays at 10%: small ink-muted and tomato-deep text over it still pass AA.
 */
export function Stain({ className = "" }: DecorProps) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none h-[46px] w-[70px] rounded-full bg-[radial-gradient(ellipse_at_40%_40%,rgba(130,70,40,0.1),rgba(130,70,40,0.04)_60%,transparent_70%)] ${className}`}
    />
  );
}

// [left %, length px, width px] of each drip along the top edge.
const DRIPS: [number, number, number][] = [
  [4, 34, 6], [13, 14, 4], [24, 58, 7], [33, 22, 5], [47, 9, 4], [59, 44, 6], [75, 18, 5], [86, 70, 7], [95, 26, 5],
];

/** Rust seeping from the top edge of the page, with uneven drips that slowly lengthen. */
export function RustBleed({ className = "" }: DecorProps) {
  return (
    <div aria-hidden="true" className={`pointer-events-none h-[90px] ${className}`}>
      <svg viewBox="0 0 400 16" preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-4 w-full">
        <path d="M0 0H400V10Q370 16 344 9T290 12T238 8T180 13T120 9T60 14T0 9Z" className="fill-rust" fillOpacity="0.55" />
      </svg>
      {DRIPS.map(([left, length, width], i) => (
        <div
          key={left}
          className="absolute top-2 origin-top animate-drip motion-reduce:animate-none"
          style={{ left: `${left}%`, animationDelay: `${-i * 1.7}s` }}
        >
          {/* Tapers from the seam down to a bead at the tip. */}
          <div
            className="rounded-b-full bg-linear-to-b from-rust/60 to-rust-deep/70 [clip-path:polygon(0_0,100%_0,80%_100%,20%_100%)]"
            style={{ width, height: length }}
          />
          <div className="-mt-1 rounded-full bg-rust-deep/70" style={{ width: width * 1.2, height: width * 1.4, marginLeft: -width * 0.1 }} />
        </div>
      ))}
    </div>
  );
}

/** One or two rust drips hanging from the element above (the A-2 button). */
export function RustDrip({ className = "" }: DecorProps) {
  return (
    <svg aria-hidden="true" width="120" height="40" viewBox="0 0 120 40" className={`pointer-events-none ${className}`}>
      <path d="M30 0h8v14a4 4 0 0 1-8 0Z" className="fill-rust" fillOpacity="0.75" />
      <circle cx="34" cy="22" r="2.6" className="fill-rust-deep" fillOpacity="0.7" />
      <g className={`${ownBox} origin-top animate-drip motion-reduce:animate-none`}>
        <path d="M78 0h6v26a3 3 0 0 1-6 0Z" className="fill-rust-deep" fillOpacity="0.8" />
      </g>
    </svg>
  );
}
