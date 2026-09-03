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
  // Keep the native/node database driver out of the bundle (server-only).
  serverExternalPackages: ['postgres'],
};

export default nextConfig;
