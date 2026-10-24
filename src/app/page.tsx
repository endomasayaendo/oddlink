import { Shortener } from "@/components/Shortener";

export default function Home() {
  return (
    <main className="mx-auto max-w-[860px] px-4 py-6 text-center sm:p-8">
      <h1 className="text-brand-gradient mb-2 text-[2.25rem] font-bold sm:text-5xl">OddLink</h1>
      <p className="mb-8 text-[0.9rem] text-[#666] sm:text-base">Where links get odd</p>
      <Shortener />
    </main>
  );
}
