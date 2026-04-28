/** @type {import('next').NextConfig} */
const apiBaseUrl = process.env.CLAWAAS_API_BASE_URL || "http://127.0.0.1:8000";
const allowedOriginsEnv = process.env.CLAWAAS_CORS_ALLOWED_ORIGINS || process.env.NEXT_ALLOWED_DEV_ORIGINS || "";
const allowedOrigins = allowedOriginsEnv
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: allowedOrigins,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiBaseUrl}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
