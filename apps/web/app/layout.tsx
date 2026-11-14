import type { Metadata } from "next";
import { Fredoka, Nunito, Patrick_Hand } from "next/font/google";
import "./globals.css";

// Fredoka and Nunito are variable fonts: one file each covers every weight we use.
const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  display: "swap",
});

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  display: "swap",
});

// Only the result card and the not-found pages use it, so don't preload it on every page.
const patrickHand = Patrick_Hand({
  variable: "--font-patrick-hand",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "OddLink - Where links get odd",
  description: "A URL shortener that generates surreal English phrases as short codes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fredoka.variable} ${nunito.variable} ${patrickHand.variable} antialiased`}>
      <body className="paper-texture flex min-h-screen min-w-[320px] items-center bg-paper font-sans leading-normal text-ink">
        <div className="w-full">{children}</div>
      </body>
    </html>
  );
}
