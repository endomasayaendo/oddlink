/**
 * True when the URL carries a username or password (`https://google.com@evil.example`).
 * The part before `@` looks like the destination but is not, which makes these URLs a
 * common phishing disguise. Shared by issuing and redirecting so the two rules can't drift.
 * An empty userinfo (`https://@example.com`) parses to empty strings and is not flagged.
 */
export function hasUserinfo(url: URL): boolean {
  return url.username !== "" || url.password !== "";
}
