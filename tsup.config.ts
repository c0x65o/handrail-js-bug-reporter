import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    server: "src/server.ts",
    react: "src/react-entry.ts",
  },
  clean: true,
  dts: true,
  format: ["esm", "cjs"],
  outDir: "dist",
  platform: "neutral",
  sourcemap: true,
  splitting: false,
  target: "es2022",
  treeshake: true,
});
