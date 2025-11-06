
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
    // ✅ Voorkom dat Next blokkeert op ESM worker
    config.externals = [...(config.externals || []), "pdfjs-dist/build/pdf.worker.min.mjs"];
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
