import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Freebuff injects PORT for the preview; fall back to 5173 locally.
const port = Number(process.env.PORT) || 5173;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port,
    strictPort: true,
    hmr: false,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
