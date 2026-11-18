import type { Metadata } from "next";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "OddLink - Where links get odd",
  description: "A URL shortener that generates surreal English phrases as short codes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Content is anchored to the top, so a page that streams in or grows below never moves what is
  // already on screen. Pages that want a centered look (the error pages) center themselves.
  return (
    <html lang="en" className={`${fontVariables} antialiased`}>
      <body className="paper-texture min-h-screen min-w-[320px] bg-paper font-sans leading-normal text-ink">{children}</body>
    </html>
  );
}
