import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  transpilePackages: ["@loop/core"],
};

export default createNextIntlPlugin()(nextConfig);
