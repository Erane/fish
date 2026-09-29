import { defineConfig } from "vite-plus";
import { VitePWA } from "vite-plugin-pwa";

const OPEN_METEO = /^https:\/\/(api|geocoding-api)\.open-meteo\.com\//;

export default defineConfig({
  base: "/fish/",
  server: { host: true },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "知鱼",
        short_name: "知鱼",
        description: "可交互的锦鲤池塘动态壁纸",
        lang: "zh-CN",
        start_url: ".",
        scope: ".",
        display: "standalone",
        orientation: "any",
        background_color: "#0d1412",
        theme_color: "#0d1412",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png}"],
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            urlPattern: OPEN_METEO,
            handler: "NetworkFirst",
            options: {
              cacheName: "open-meteo",
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 32, maxAgeSeconds: 6 * 3600 },
            },
          },
        ],
      },
    }),
  ],
  staged: {
    "*": "vp check --fix",
  },
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
