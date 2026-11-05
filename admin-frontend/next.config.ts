import type { NextConfig } from "next";
import { execSync } from "child_process";

const backendUrl = process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_URL || "http://localhost:5000";

let gitHash = process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || "";
if (!gitHash) {
  try {
    gitHash = execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    try {
      gitHash = execSync("git -C .. rev-parse --short HEAD").toString().trim();
    } catch {
      gitHash = "";
    }
  }
}

const now = new Date();
const istDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
}).format(now);
const istTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
}).format(now);
const buildTime = `${istDate}, ${istTime} IST`;
const buildId = gitHash || buildTime.replace(/[^a-zA-Z0-9]/g, "");
const buildDisplay = `Build ${buildTime} · ${buildId}`;

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
    NEXT_PUBLIC_BUILD_TIME: buildTime,
    NEXT_PUBLIC_BUILD_DISPLAY: buildDisplay,
  },
  async rewrites() {
    return [
      {
        source: "/api/admin/:path*",
        destination: `${backendUrl}/api/admin/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
