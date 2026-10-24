import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // mysql2 & sharp dipakai di server saja
  serverExternalPackages: ['mysql2', 'sharp'],
  // tombol indikator mode pengembangan menutupi menu bawah di HP
  devIndicators: false,
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
};

export default nextConfig;
