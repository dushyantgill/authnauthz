import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  distDir: process.env.TEST_SERVER ? ".next-test" : ".next",
  serverExternalPackages: [
    "oidc-provider",
    "samlify",
    "@authenio/samlify-node-xmllint",
    "node-xmllint",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
    ];
  },
};
export default config;
