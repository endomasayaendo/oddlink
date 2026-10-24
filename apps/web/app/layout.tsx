import type { Metadata } from "next";
import { Special_Elite } from "next/font/google";
import "./globals.css";

const specialElite = Special_Elite({
  variable: "--font-special-elite",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OddLink - Where links get odd",
  description: "A URL shortener that generates surreal English phrases as short codes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${specialElite.variable} antialiased`}>
      <body className="flex min-h-screen min-w-[320px] items-center bg-white font-sans leading-normal text-ink">
        <div className="w-full">{children}</div>
      </body>
    </html>
  );
}
