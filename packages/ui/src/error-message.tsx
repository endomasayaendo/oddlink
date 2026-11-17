import { type ReactNode, useEffect, useRef } from "react";

type Props = {
  message: string;
  /** Optional extra content (links, attribution) shown under the message. */
  children?: ReactNode;
  onDismiss: () => void;
  /**
   * Extra classes for the root, typically outer spacing. Defaults to `mb-6`;
   * passing a value replaces that default rather than adding to it.
   */
  className?: string;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A dismissible alert. Dismissing it returns focus to the element that was focused when it appeared
 * (usually the control whose action failed), or else to the nearest focusable element before it, so
 * keyboard and screen reader users don't land on the page body.
 */
export function ErrorMessage({ message, children, onDismiss, className = "mb-6" }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const originRef = useRef<Element | null>(null);

  useEffect(() => {
    originRef.current = document.activeElement;
  }, []);

  const dismiss = () => {
    const root = rootRef.current;
    const active = document.activeElement;
    // Leave focus alone if it is already somewhere else; only rescue it from the soon-removed alert.
    if (root && (!active || active === document.body || root.contains(active))) {
      restoreFocus(root, originRef.current);
    }
    onDismiss();
  };

  return (
    <div
      ref={rootRef}
      role="alert"
      className={`flex animate-fade-in-down items-center gap-3 rounded-wobble border-2 border-rust bg-rust-wash px-4 py-3.5 ${className}`}
    >
      <div className="flex-1 text-left text-[0.9rem] text-rust">
        <span>{message}</span>
        {children}
      </div>
      {/* 24×24 target; the negative margins keep the glyph and the row height where they were. */}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Close"
        className="-my-1 -mr-1.5 inline-flex min-h-6 min-w-6 cursor-pointer items-center justify-center text-xl leading-none text-rust transition-colors hover:text-rust-deep"
      >
        &times;
      </button>
    </div>
  );
}

function tryFocus(el: Element | null, root: HTMLElement): boolean {
  if (!(el instanceof HTMLElement) || el === document.body || !el.isConnected || root.contains(el)) return false;
  el.focus();
  return document.activeElement === el;
}

function restoreFocus(root: HTMLElement, origin: Element | null) {
  if (tryFocus(origin, root)) return;
  const candidates = Array.from(document.querySelectorAll(FOCUSABLE));
  for (let i = candidates.length - 1; i >= 0; i--) {
    const el = candidates[i];
    // Only elements that come before the alert in document order.
    if (!(el.compareDocumentPosition(root) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
    if (tryFocus(el, root)) return;
  }
}
