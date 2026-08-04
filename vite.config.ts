import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import packageJson from "./package.json";

export default defineConfig({
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icons/apple-touch-icon.png"],
      manifest: {
        name: "手鳥州",
        short_name: "手鳥州",
        description: "映写技師ジェームスと遊ぶ、古い映画館風の落ち物パズルゲーム",
        id: "./",
        lang: "ja",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "portrait",
        background_color: "#1c1712",
        theme_color: "#ead9b8",
        categories: ["games"],
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: [
          "**/*.{js,css,html,webmanifest,png}",
          "assets/Коробе́йники-*.mp3",
        ],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            urlPattern: /\.(?:mp3|m4a|wav|ogg|flac|aac)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "tetorisu-audio",
              rangeRequests: true,
              cacheableResponse: {
                statuses: [0, 200],
              },
              expiration: {
                maxEntries: 5,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
  },
});
