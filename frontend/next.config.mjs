/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    const rawBackendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const backendUrl = rawBackendUrl.replace(/\/$/, '');
    const destination = backendUrl.endsWith('/api') ? `${backendUrl}/:path*` : `${backendUrl}/api/:path*`;
    return [
      {
        source: '/api/:path*',
        destination,
      },
    ];
  },
}

export default nextConfig

