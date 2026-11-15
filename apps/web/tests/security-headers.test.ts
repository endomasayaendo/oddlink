import { describe, expect, it, vi } from "vitest";
import nextConfig from "@/next.config";
import { contentSecurityPolicy, securityHeaders } from "@/lib/http/security-headers";

const asMap = (headers: { key: string; value: string }[]) => Object.fromEntries(headers.map((h) => [h.key, h.value]));

describe("security headers", () => {
  it("applies to every path, including `/`", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/:path*");
  });

  it("sends the baseline headers", () => {
    const headers = asMap(securityHeaders({ dev: false, production: true }));
    expect(headers).toMatchObject({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Strict-Transport-Security": "max-age=63072000",
    });
    expect(headers["Permissions-Policy"]).toContain("camera=()");
  });

  it("sends HSTS only in production", () => {
    expect(asMap(securityHeaders({ dev: true, production: false }))).not.toHaveProperty("Strict-Transport-Security");
  });

  it("locks the CSP to this origin, with eval only in development", () => {
    const prod = contentSecurityPolicy({ dev: false });
    for (const directive of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "img-src 'self' data:"]) {
      expect(prod).toContain(directive);
    }
    expect(prod).not.toContain("unsafe-eval");
    expect(prod).not.toMatch(/https?:/);
    expect(contentSecurityPolicy({ dev: true })).toContain("'unsafe-eval'");
  });

  it("derives dev/production from NODE_ENV", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const headers = asMap((await nextConfig.headers!())[0].headers);
      expect(headers["Strict-Transport-Security"]).toBeDefined();
      expect(headers["Content-Security-Policy"]).not.toContain("unsafe-eval");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
