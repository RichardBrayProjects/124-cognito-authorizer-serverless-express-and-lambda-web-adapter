import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
  },

  // Dev: serve at /
  // Prod build: assets/routes under /uptickart/
  base: mode === "development" ? "/" : "/uptickart/",

  build: {
    outDir: "dist",
    assetsDir: "assets",
  },
}));
