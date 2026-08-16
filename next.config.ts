import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  assetPrefix: "/penny-expense-tracker",
};

export default nextConfig;
