import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The core Y.Doc <-> CanvasData binding + convergence tests are pure
    // (Yjs only, no DOM). Node environment keeps them fast and headless.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
