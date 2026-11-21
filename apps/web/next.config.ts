import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Next's build-time TypeScript check on worker threads in sandboxed environments.
  experimental: {
    workerThreads: true,
    useTypeScriptCli: false,
  },
  transpilePackages: [
    "@motionface/motion-core",
    "@motionface/tracking-web",
    "@motionface/avatar-three",
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
