
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  // External packages that should not be bundled
  serverExternalPackages: ['pdfjs-dist', 'react-pdf'],
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
    // Configure webpack to handle pdf.worker.min.mjs as asset/source
    config.module.rules.push({
      test: /pdf\.worker\.min\.mjs$/,
      type: "asset/source",
    });
    return config;
  },
  experimental: {
    esmExternals: "loose",
  },
  // Turbopack configuration for development builds
  turbopack: {
    resolveAlias: {
      fs: './noop.js',
    },
  },
};

export default nextConfig;
