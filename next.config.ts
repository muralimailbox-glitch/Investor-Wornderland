import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion', 'drizzle-orm'],
  },
  // Don't bundle the ONNX runtime — it's resolved at runtime from disk on
  // the server. Without this Next tries to webpack it and times out.
  serverExternalPackages: ['@xenova/transformers', 'onnxruntime-node', 'sharp'],
  images: {
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;
