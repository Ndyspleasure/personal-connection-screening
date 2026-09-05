/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@pcs/config',
    '@pcs/db',
    '@pcs/domain',
    '@pcs/security',
    '@pcs/types',
    '@pcs/ui',
    '@pcs/validation',
  ],
  // Silence Next 15's cross-origin-request check when running behind a reverse proxy.
  // Keep the native/node database driver out of the bundle (server-only).
  serverExternalPackages: ['postgres'],
};

export default nextConfig;
