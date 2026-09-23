import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The dev proxy avoids CORS entirely and keeps API paths relative.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The DICOM image loader spawns an ES-module web worker for decoding. Vite's
  // default worker format (iife) cannot be used for a code-splitting build, so
  // the worker must be emitted as an ES module.
  worker: {
    format: "es",
  },
  optimizeDeps: {
    // The loader creates its worker with `new Worker(new URL('...', import.meta.url))`.
    // Pre-bundling it into a single file would break that URL resolution, so it is
    // excluded from dependency pre-bundling while its runtime deps are pre-bundled.
    exclude: ["@cornerstonejs/dicom-image-loader"],
    // The codec packages ship UMD bundles that must be pre-bundled (and therefore
    // converted to ESM by esbuild) — served raw, Vite would report
    // "does not provide an export named 'default'".
    include: [
      "@cornerstonejs/core",
      "dicom-parser",
      "@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs",
      "@cornerstonejs/codec-charls/decodewasmjs",
      "@cornerstonejs/codec-openjpeg/decodewasmjs",
      "@cornerstonejs/codec-openjph/wasmjs",
    ],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});

