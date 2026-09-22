import type { NextConfig } from "next";
import { CDN_HOSTS } from "./lib/pieces/manifest";

// The sandbox page hosts agent-authored pieces on a second origin. Its CSP is
// what makes the library manifest "vetted": scripts and styles can only come
// from the page itself and the manifest's CDN hosts.
const cdn = CDN_HOSTS.join(" ");
const hostOrigins =
  process.env.RENDR_HOST_ORIGINS ?? "http://localhost:* http://127.0.0.1:*";

const sandboxCsp = [
  "default-src 'none'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: ${cdn}`,
  `style-src 'self' 'unsafe-inline' ${cdn}`,
  `font-src 'self' data: ${cdn}`,
  "img-src * data: blob:",
  "media-src * data: blob:",
  `connect-src 'self' ${cdn} https://tile.openstreetmap.org https://*.tile.openstreetmap.org`,
  "worker-src 'self' blob:",
  "child-src blob:",
  `frame-ancestors ${hostOrigins}`,
].join("; ");

const nextConfig: NextConfig = {
  // Both subscription SDKs spawn a CLI binary resolved from their own package
  // dir, which only works if they aren't bundled.
  serverExternalPackages: [
    "@anthropic-ai/claude-agent-sdk",
    "@openai/codex-sdk",
  ],
  async headers() {
    return [
      {
        source: "/sandbox.html",
        headers: [{ key: "Content-Security-Policy", value: sandboxCsp }],
      },
    ];
  },
};

export default nextConfig;
