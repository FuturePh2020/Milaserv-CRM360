/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@milaserv/contracts", "@milaserv/ui"],
  // Traces and bundles only the node_modules this app actually needs into
  // .next/standalone - the Docker demo's Dockerfile relies on this. Vercel
  // has its own optimized serverless build output and explicitly
  // recommends against "standalone" for its deployments, so this is only
  // set when BUILD_STANDALONE=true (the Docker build passes it; Vercel's
  // build environment never does).
  ...(process.env.BUILD_STANDALONE === "true" ? { output: "standalone" } : {}),
  async rewrites() {
    // Same-origin API proxy for the Vercel deployment (mirrors the Nginx
    // gateway used for the Docker demo): the browser only ever talks to
    // this Vercel origin, at /api/*, which Next.js rewrites server-side to
    // the real Render API URL - no CORS, and the refresh-token httpOnly
    // cookie behaves the same as same-origin local dev. Set API_ORIGIN in
    // the Vercel project's environment variables (e.g.
    // https://milaserv-crm360-api.onrender.com, no trailing slash).
    const apiOrigin = process.env.API_ORIGIN;
    if (!apiOrigin) return [];
    return [{ source: "/api/:path*", destination: `${apiOrigin}/:path*` }];
  },
};

export default nextConfig;
