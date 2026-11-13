// Attribution and links Google's Safe Browsing terms ask for wherever a warning is shown
// (https://developers.google.com/safe-browsing/reference/Appropriate.Usage). Plain constants so
// client components can import them without pulling in the server-only checker.

export const UNSAFE_URL_MESSAGE =
  "This URL may be unsafe (suspected phishing or malware), so it can't be shortened.";
export const ADVISORY_TEXT = "Advisory provided by Google";
export const ADVISORY_URL = "https://developers.google.com/safe-browsing/v4/advisory";
export const SOCIAL_ENGINEERING_INFO_URL =
  "https://developers.google.com/search/docs/monitor-debug/security/social-engineering";
export const MALWARE_INFO_URL = "https://developers.google.com/search/docs/monitor-debug/security/malware";
export const SAFE_BROWSING_NOTICE =
  "Links are checked with Google Safe Browsing. Google works to provide the most accurate and up-to-date information about unsafe web resources. However, Google cannot guarantee that its information is comprehensive and error-free: some risky sites may not be identified, and some safe sites may be identified in error.";
