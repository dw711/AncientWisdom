import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The JSON corpus is read at runtime (preview mode, or when no database is
  // configured), so bundle it with the API functions explicitly.
  outputFileTracingIncludes: {
    "/api/*": ["./data/corpus/**/*.json"],
    "/api/cases/*": ["./data/corpus/**/*.json"],
  },
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
