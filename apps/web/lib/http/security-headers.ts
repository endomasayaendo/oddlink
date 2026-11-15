/**
 * Security headers sent on every response (wired up in `next.config.ts`), including the proxy's
 * 302 redirects, the rewritten 404 pages and API responses.
 *
 * The CSP is static, without nonces: with `cacheComponents` every page has a prerendered shell,
 * and a nonce-based CSP would force dynamic rendering of every page (Next.js docs: nonces are
 * incompatible with Partial Prerendering). Next's inline bootstrap scripts therefore need
 * `'unsafe-inline'`. What the policy still does: no external origins at all (next/font is
 * self-hosted, Safe Browsing is called server-side), no plugins, no `<base>` hijacking, forms and
 * framing locked to this origin.
 */
export function contentSecurityPolicy({ dev }: { dev: boolean }) {
  return [
    "default-src 'self'",
    // React uses eval in development only (error stacks, Fast Refresh).
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    // Server-rendered `style` attributes and Next's inline font styles.
    "style-src 'self' 'unsafe-inline'",
    // The paper texture and ink masks are data: SVGs in CSS.
    "img-src 'self' data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function securityHeaders({ dev, production }: { dev: boolean; production: boolean }) {
  const headers = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy({ dev }) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // The browser default, stated explicitly. On the short-link 302 it means the destination
    // sees at most the origin of the page the link was clicked on, never its path or the code.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Legacy twin of `frame-ancestors 'none'` for browsers without CSP Level 2.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  ];
  // Browsers ignore HSTS over plain http, but keep it out of dev anyway. Same value Vercel sends;
  // no includeSubDomains/preload, since those commit the whole domain.
  if (production) headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000" });
  return headers;
}
