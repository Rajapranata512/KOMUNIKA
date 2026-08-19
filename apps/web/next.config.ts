import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@aksara/domain', '@aksara/ui'],
};

export default nextConfig;
