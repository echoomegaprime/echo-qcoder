import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: [resolve(root, "server", "src", "index.ts")],
  outfile: resolve(root, "server", "dist", "index.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: ["node24"],
  packages: "bundle",
  legalComments: "none",
  sourcemap: false,
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
});

console.log("QCODER_SERVER_BUNDLE_OK entry=server/dist/index.js");
