import Link from "next/link";
import { HalfLidSun, RustBleed, RustDrip } from "@/ui/shared/decor";
import { buttonClass } from "@/ui/shared/styles";

type Props = {
  code: string;
  message: string;
};

const stillWhenReduced = "motion-reduce:animate-none";

// A-2, "fog and rust": the deepest level of the eerie layer, shared by every not-found page.
// Layers, back to front: old paper, the sinking sun, rust, fog, then the content. Fog and rust
// stay behind the content so text and the button keep their resting contrast at every frame.
export function ErrorPage({ code, message }: Props) {
  // The last character sags and is eaten away.
  const head = code.slice(0, -1);
  const tail = code.slice(-1);

  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-paper-old px-4 py-32">
      <HalfLidSun className="absolute bottom-[14%] left-[8%] -z-30 size-24 sm:left-[16%] sm:size-32" />
      <div aria-hidden="true" className="rust-corners absolute inset-0 -z-20" />
      <RustBleed className="absolute inset-x-0 top-0 -z-20" />
      <div
        aria-hidden="true"
        className={`fog absolute -inset-x-[10%] bottom-0 -z-10 h-[60%] animate-fog-drift ${stillWhenReduced}`}
      />
      <div
        aria-hidden="true"
        className={`fog absolute -inset-x-[15%] bottom-0 -z-10 h-[38%] scale-x-[-1] animate-fog-drift-slow ${stillWhenReduced}`}
      />

      {/* A pale halo of fog gathers behind the words, so rust never reaches the text. */}
      <div className="relative max-w-[600px] text-center before:absolute before:-inset-x-10 before:-inset-y-8 before:-z-10 before:rounded-full before:bg-[radial-gradient(ellipse_closest-side,rgb(240_236_226/0.9),rgb(240_236_226/0.6)_60%,transparent)]">
        <p
          className={`mb-2 font-display text-[3.5rem] leading-tight font-semibold text-rust sm:text-[5rem] animate-flicker ${stillWhenReduced}`}
        >
          {/* Split for the look only; screen readers get the code as one word ("404", not "40 4"). */}
          <span aria-hidden="true">
            {head}
            <span className="decayed inline-block translate-y-1.5 rotate-[7deg] text-rust-deep">{tail}</span>
          </span>
          <span className="sr-only">{code}</span>
        </p>
        <p className={`mb-10 font-hand text-xl text-ink sm:text-2xl animate-flicker-late ${stillWhenReduced}`}>{message}</p>
        <div className="relative inline-block">
          <Link href="/" className={`${buttonClass} px-6 py-3`}>
            Back to OddLink
          </Link>
          <RustDrip className="absolute top-full left-1/2 -translate-x-1/2" />
        </div>
      </div>
    </div>
  );
}
