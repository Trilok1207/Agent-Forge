import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** Server-side only. The browser never sees this URL; it talks to /api on our own origin. */
const apiBase = process.env.API_BASE_URL ?? "http://127.0.0.1:8787";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@agentflow/ui", "@agentflow/contracts", "@agentflow/demo-data"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Same-origin proxy: session cookies stay first-party on the web origin, and
  // OAuth secrets stay in the API process (ADR-016).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiBase}/:path*` }];
  },
};

export default config;
