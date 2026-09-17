import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    resolveAlias: {
      "platonik-wasm": "./public/wasm/platonik_wasm.js",
    },
  },
};

export default config;
