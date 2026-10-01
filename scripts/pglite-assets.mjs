import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const PGLITE_ASSET_NAMES = ["pglite.data", "pglite.wasm", "initdb.wasm"];

export function pgliteAssetSources(root) {
  const dist = join(root, "node_modules", "@electric-sql", "pglite", "dist");
  const dest = join(root, ".output", "server");
  return PGLITE_ASSET_NAMES.map((name) => ({ name, from: join(dist, name), to: join(dest, name) }));
}

export function copyPgliteAssets(root, { copyFile = copyFileSync, exists = existsSync } = {}) {
  const copied = [];
  for (const { name, from, to } of pgliteAssetSources(root)) {
    if (!exists(from)) throw new Error(`missing PGLite asset ${from}`);
    copyFile(from, to);
    copied.push(name);
  }
  return copied;
}
