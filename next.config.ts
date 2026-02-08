import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  
  // 允许外部访问
  allowedDevOrigins: [
    "http://100.122.211.68:3333",
    "http://localhost:3333",
  ],
};

export default nextConfig;
