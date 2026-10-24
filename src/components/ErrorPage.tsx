import Link from "next/link";

type Props = {
  code: string;
  message: string;
};

export function ErrorPage({ code, message }: Props) {
  return (
    <div className="mx-auto max-w-[600px] px-4 py-6 text-center sm:p-8">
      <p className="text-brand-gradient mb-2 text-[3.5rem] font-bold sm:text-[5rem]">{code}</p>
      <p className="mb-8 text-base text-[#666] sm:text-xl">{message}</p>
      <Link
        href="/"
        className="bg-brand-gradient inline-block rounded-lg px-6 py-3 font-semibold text-white transition hover:-translate-y-px hover:no-underline hover:opacity-90"
      >
        Back to OddLink
      </Link>
    </div>
  );
}
