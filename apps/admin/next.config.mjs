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
  serverExternalPackages: ['postgres'],
};

export default nextConfig;
