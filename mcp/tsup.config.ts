import { defineConfig } from "tsup";

export default defineConfig({
  entry:     ["src/index.ts"],
  format:    ["esm"],
  banner:    { js: "#!/usr/bin/env node" },
  clean:     true,
  splitting: false,
  bundle:    true,
  minify:    false,
  target:    "node18",
});
