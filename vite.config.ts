import { defineConfig } from "vitest/config";

const isolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  define: { __APP_VERSION__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? "dev") },
  optimizeDeps: {
    exclude: ["homr-web", "onnxruntime-web"],
    include: ["homr-web > @techstark/opencv-js"],
  },
  server: { headers: isolation },
  // NO_ISOLATION mimics GitHub Pages, where coi-serviceworker has to add the headers.
  preview: { headers: process.env.NO_ISOLATION ? {} : isolation },
  build: { target: "es2022", chunkSizeWarningLimit: 4000 },
  worker: {
    format: "es",
    // homr-web's worker loads OpenCV with a dynamic import. As a separate chunk, OpenCV imports
    // the worker entry back; on iPhone Safari (page served through coi-serviceworker) that runs the
    // entry a second time, and the second, never-started engine answers "recognize while the
    // worker is idle". One file per worker avoids the self-import.
    rolldownOptions: { output: { inlineDynamicImports: true } },
  },
  test: { exclude: ["e2e/**", "node_modules/**"] },
});
