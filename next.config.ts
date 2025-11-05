
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  // Disable server-side rendering for certain modules
  serverExternalPackages: ['tesseract.js', 'pdfjs-dist', 'react-pdf'],
  /* config options here */
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
  // Webpack configuration for production builds (only used when not using Turbopack)
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Mark tesseract.js as external for client-side only
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }
    return config;
  },
  // Turbopack configuration for development builds
  // This configuration acknowledges Turbopack to prevent the warning
  // Configure resolveAlias to match Webpack fallback behavior
  turbopack: {
    resolveAlias: {
      // Mark fs as unavailable for client-side bundles
      // Alias to empty module to disable (same as Webpack fallback: false)
      fs: './noop.js',
    },
  },
};

export default nextConfig;
