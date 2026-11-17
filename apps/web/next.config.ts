import type { NextConfig } from "next";
import { noindexHeaderRules } from "./lib/http/robots-headers";
import { securityHeaders } from "./lib/http/security-headers";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source, so Next compiles them.
  transpilePackages: ["@oddlink/ui", "@oddlink/utils"],
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    const env = process.env.NODE_ENV;
    return [
      { source: "/:path*", headers: securityHeaders({ dev: env === "development", production: env === "production" }) },
      ...noindexHeaderRules(),
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
