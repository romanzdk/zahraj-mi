import { defineConfig } from "vitest/config";

const isolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  optimizeDeps: {
    exclude: ["homr-web", "onnxruntime-web"],
    include: ["homr-web > @techstark/opencv-js"],
  },
  server: { headers: isolation },
  preview: { headers: isolation },
  build: { target: "es2022", chunkSizeWarningLimit: 4000 },
  worker: { format: "es" },
  test: { exclude: ["e2e/**", "node_modules/**"] },
});
