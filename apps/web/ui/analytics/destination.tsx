const className = "block text-[0.8rem] break-all text-ink-muted";

/**
 * The link's destination under its short URL. Rendered as a link only through `originalHref`,
 * the URL a redirect would follow; a stored value the redirect refuses is shown as plain text.
 * Renders nothing when there is no destination to show (a link disabled by anyone but its owner).
 */
export function Destination({ originalUrl, originalHref }: { originalUrl: string | null; originalHref: string | null }) {
  if (originalUrl === null) return null;
  if (originalHref === null) return <p className={className}>{originalUrl}</p>;
  return (
    <a href={originalHref} target="_blank" rel="noopener noreferrer" className={className}>
      {originalUrl}
    </a>
  );
}
