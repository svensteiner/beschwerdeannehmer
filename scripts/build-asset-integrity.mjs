import { statSync } from "node:fs";
import { basename, join } from "node:path";

// Deliberately only inspect quoted, literal CSS/JS asset paths. This avoids
// treating arbitrary minified text or dynamic URL construction as an asset.
const ASSET_REF = /["'`]\/assets\/([A-Za-z0-9][A-Za-z0-9._-]*\.(?:css|js))["'`]/g;

export function assetRefsFromServerBundle(bundle) {
  const refs = new Set();
  for (const match of String(bundle ?? "").matchAll(ASSET_REF)) refs.add(match[1]);
  return [...refs];
}

export function missingAssetRefs(bundle, publicAssetsDir) {
  return assetRefsFromServerBundle(bundle).filter((ref) => {
    try {
      return !statSync(join(publicAssetsDir, basename(ref))).isFile();
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) return true;
      throw error;
    }
  });
}

if (basename(process.argv[1] ?? "") === "build-asset-integrity.mjs") {
  const [serverBundle, publicAssetsDir] = process.argv.slice(2);
  if (!serverBundle || !publicAssetsDir) {
    console.error("Usage: node scripts/build-asset-integrity.mjs SERVER_BUNDLE PUBLIC_ASSETS_DIR");
    process.exitCode = 2;
  } else {
    const { readFileSync } = await import("node:fs");
    const missing = missingAssetRefs(readFileSync(serverBundle, "utf8"), publicAssetsDir);
    if (missing.length) {
      console.error(`[asset-integrity] missing public assets: ${missing.join(", ")}`);
      process.exitCode = 1;
    } else {
      console.log("[asset-integrity] all literal CSS/JS asset references exist");
    }
  }
}
