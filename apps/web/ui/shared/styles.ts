// The storybook button: tomato fill, ink outline and an offset shadow that "presses in" on hover.
// `not-disabled:` instead of `enabled:` so the hover also applies to links styled as buttons.
export const buttonClass =
  "inline-block cursor-pointer rounded-wobble border-2 border-ink-strong bg-tomato-deep font-display font-medium text-white shadow-offset transition not-disabled:hover:translate-x-0.5 not-disabled:hover:translate-y-0.5 not-disabled:hover:shadow-offset-sm hover:no-underline disabled:cursor-not-allowed disabled:opacity-60";
