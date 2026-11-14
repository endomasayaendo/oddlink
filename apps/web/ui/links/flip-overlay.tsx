"use client";

import { useState, useSyncExternalStore } from "react";

const REDUCED = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * A-3, "the underside": the moment a link is issued, the page turns over to a dark, rust-brown
 * underside for under half a second and comes back. Mount it with a key per issued code so it
 * plays exactly once per link; it removes itself when its animation ends.
 *
 * Flash safety: one dark flash per issuance (far below 3 per second; the submit button is
 * disabled while pending), peak opacity 0.92 so it is never black, and the color is a
 * desaturated brown, not red. Under prefers-reduced-motion it is not rendered at all (and the
 * CSS hides it too, as a fallback).
 * It takes no pointer events and never moves focus.
 */
export function FlipOverlay() {
  const [done, setDone] = useState(false);
  // Only mounted after a client-side action, so the server snapshot is never really used.
  const reduced = useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia(REDUCED).matches, () => true);
  if (done || reduced) return null;

  return (
    <div
      aria-hidden="true"
      onAnimationEnd={(e) => {
        // The glimpse inside has its own animation; only the overlay's own end unmounts it.
        if (e.target === e.currentTarget) setDone(true);
      }}
      className="pointer-events-none fixed inset-0 z-50 flex animate-flip items-center justify-center bg-underside motion-reduce:hidden"
    >
      <UndersideGlimpse />
    </div>
  );
}

// What is on the other side of the paper, seen for a moment: the sun from the top page, drawn
// in faint lines and looking straight back. Low contrast against the underside on purpose, so it
// adds no second flash of its own.
function UndersideGlimpse() {
  return (
    <svg viewBox="0 0 200 200" className="size-[min(70vw,70vh)] animate-glimpse">
      <g fill="none" stroke="#6b5141" strokeWidth="2.5" strokeLinecap="round">
        <circle cx="100" cy="100" r="58" />
        {Array.from({ length: 12 }, (_, i) => {
          const rad = (i * 30 * Math.PI) / 180;
          const r2 = i === 7 ? 96 : 80;
          return (
            <line
              key={i}
              x1={100 + 66 * Math.cos(rad)}
              y1={100 + 66 * Math.sin(rad)}
              x2={100 + r2 * Math.cos(rad)}
              y2={100 + r2 * Math.sin(rad)}
            />
          );
        })}
        <path d="M70 100 Q100 78 130 100 Q100 122 70 100Z" />
      </g>
      <circle cx="100" cy="100" r="9" fill="#6b5141" />
    </svg>
  );
}
