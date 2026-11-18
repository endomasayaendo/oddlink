import type { Metadata } from "next";
import { BASE_URL } from "@/lib/constants";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: "OddLink - Where links get odd",
  description: "A URL shortener that generates surreal English phrases as short codes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fontVariables} antialiased`}>
      <body className="paper-texture flex min-h-screen min-w-[320px] items-center bg-paper font-sans leading-normal text-ink">
        <div className="w-full">{children}</div>
      </body>
    </html>
  );
}
