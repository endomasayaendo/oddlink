import { EyedSun, Stain } from "@/ui/shared/decor";
import { Shortener } from "@/ui/links/shortener";

export default function Home() {
  return (
    <main className="relative mx-auto max-w-[860px] px-4 py-6 text-center sm:p-8">
      <EyedSun className="absolute top-3 right-4 sm:top-6 sm:right-8" />
      <h1 className="mb-2 font-display text-[2.5rem] leading-none font-semibold text-tomato sm:text-5xl">OddLink</h1>
      <p className="mb-8 text-[0.9rem] sm:text-base">
        {/* Only the transform differs, so the sentence still reads in order. */}
        Where links get <span className="inline-block translate-y-px -rotate-4">odd</span>
      </p>
      <Shortener />
      <Stain className="fixed right-[6%] bottom-[8%] -z-10" />
    </main>
  );
}
