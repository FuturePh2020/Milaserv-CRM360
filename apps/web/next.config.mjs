/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@milaserv/contracts", "@milaserv/ui"],
  // Traces and bundles only the node_modules this app actually needs into
  // .next/standalone - the standard minimal-image pattern for a monorepo
  // Next.js app running behind Docker.
  output: "standalone",
};

export default nextConfig;
