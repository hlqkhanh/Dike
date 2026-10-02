import type { NextConfig } from 'next';

const config: NextConfig = {
  agentRules: false,
  reactStrictMode: true,
  transpilePackages: ['@dike/api-client', '@dike/contracts', '@dike/ui'],
};

export default config;
