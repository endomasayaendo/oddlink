import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // A component library has no Next.js pages directory for this rule to check links against.
  { rules: { "@next/next/no-html-link-for-pages": "off" } },
]);
