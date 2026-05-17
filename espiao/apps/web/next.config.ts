import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Fix workspace root detection in monorepo (silences Next.js lockfile warning)
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Expose NEXT_PUBLIC_* vars at build time — no server-only secrets here.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
    NEXT_PUBLIC_SOCKET_URL:
      process.env.NEXT_PUBLIC_SOCKET_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      "http://localhost:3001"
  }
};

export default nextConfig;
