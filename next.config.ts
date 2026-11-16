import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  logging: { incomingRequests: { ignore: [/^\/auth\/callback(?:\?|$)/] } },
  // Playwright and the Prisma engine must stay as Node modules on the server.
  serverExternalPackages: ["playwright", "playwright-core", "@prisma/client", "unpdf", "mammoth"],
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
