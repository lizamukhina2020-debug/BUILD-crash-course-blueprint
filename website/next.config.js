/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  trailingSlash: false,
  // Prevent Next.js from inferring a parent workspace root when this site
  // lives inside the SeedMind monorepo (avoids picking the wrong lockfile).
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;

