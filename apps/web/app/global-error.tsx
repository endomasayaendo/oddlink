"use client";

import { CrashPage } from "@/ui/shared/crash-page";
import { fontVariables } from "./fonts";
import "./globals.css";

// Replaces the root layout when the layout itself throws, so it brings its own <html>, styles and fonts.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en" className={`${fontVariables} antialiased`}>
      <body className="paper-texture min-h-screen min-w-[320px] bg-paper font-sans leading-normal text-ink">
        <CrashPage error={error} retry={retry} />
      </body>
    </html>
  );
}
