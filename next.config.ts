
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
    ],
  },
  // Webpack configuration for production builds
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }
    // Remove the external config for pdf worker so webpack can bundle it
    // This allows the worker to be loaded locally instead of from CDN
    config.externals = (config.externals || []).filter(
      (external: any) => !(typeof external === 'string' && external.includes('pdf.worker'))
    );
    return config;
  },
  // Turbopack configuration for development builds
  turbopack: {
    resolveAlias: {
      fs: './noop.js',
    },
  },
};

export default nextConfig;
