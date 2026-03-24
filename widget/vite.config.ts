import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    // Single JS file — easy to inline into MCP resource
    codeSplitting: false,
    rollupOptions: {
      output: {
        entryFileNames: "widget.js",
        assetFileNames: "widget.[ext]",
      },
    },
    // Inline CSS into the JS bundle
    cssCodeSplit: false,
    // Keep bundle small
    minify: "esbuild",
    sourcemap: false,
  },
  // Dev server
  server: {
    port: 5173,
    strictPort: false,
  },
});
