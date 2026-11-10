import { defineConfig } from "vite";
export default defineConfig({
  server: { allowedHosts: true },
  build: { outDir: "dist" },
});
