// Shared by the root layout and global-error.tsx, which replaces the layout and its <html>.
import { Fredoka, Nunito, Patrick_Hand } from "next/font/google";

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

// Only the result card and the not-found and error pages use it, so don't preload it on every page.
const patrickHand = Patrick_Hand({
  variable: "--font-patrick-hand",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

export const fontVariables = `${fredoka.variable} ${nunito.variable} ${patrickHand.variable}`;
