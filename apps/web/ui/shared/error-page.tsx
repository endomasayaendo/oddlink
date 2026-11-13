import Link from "next/link";
import { buttonClass } from "@/ui/shared/styles";

type Props = {
  code: string;
  message: string;
};

export function ErrorPage({ code, message }: Props) {
  return (
    <div className="mx-auto max-w-[600px] px-4 py-6 text-center sm:p-8">
      <p className="mb-2 font-display text-[3.5rem] font-semibold text-tomato sm:text-[5rem]">{code}</p>
      <p className="mb-8 text-base text-ink-muted sm:text-xl">{message}</p>
      <Link href="/" className={`${buttonClass} px-6 py-3`}>
        Back to OddLink
      </Link>
    </div>
  );
}
