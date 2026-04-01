/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  trailingSlash: false,
  // Prevent Next.js from inferring a parent workspace root when this site
  // lives inside the SeedMind monorepo (avoids picking the wrong lockfile).
  turbopack: {
    root: __dirname,
  },
  // Fresh HTML on the landing page so nav/copy updates aren’t stuck behind CDN cache.
  async headers() {
    return [
      {
        source: '/',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, s-maxage=0, must-revalidate, stale-while-revalidate=0',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

