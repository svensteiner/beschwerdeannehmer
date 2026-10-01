import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assetRefsFromServerBundle, missingAssetRefs } from "./build-asset-integrity.mjs";

test("Asset-Guard erkennt fehlende literal CSS/JS-Referenzen", async () => {
  const root = await mkdtemp(join(tmpdir(), "silvia-asset-guard-"));
  const assets = join(root, "assets");
  await mkdir(assets);
  await writeFile(join(assets, "styles-good.css"), "synthetic");
  const bundle = `head href="/assets/styles-good.css" src='/assets/app-good.js' dynamic=/assets/not-literal.css`;
  assert.deepEqual(assetRefsFromServerBundle(bundle), ["styles-good.css", "app-good.js"]);
  assert.deepEqual(missingAssetRefs(bundle, assets), ["app-good.js"]);
});

test("Asset-Guard besteht bei vorhandenen Referenzen", async () => {
  const root = await mkdtemp(join(tmpdir(), "silvia-asset-guard-"));
  const assets = join(root, "assets");
  await mkdir(assets);
  await writeFile(join(assets, "styles-good.css"), "synthetic");
  await writeFile(join(assets, "app-good.js"), "synthetic");
  assert.deepEqual(missingAssetRefs(`"/assets/styles-good.css" '/assets/app-good.js'`, assets), []);
});

test("Asset-Guard behandelt Ordner nicht als Datei", async () => {
  const root = await mkdtemp(join(tmpdir(), "silvia-asset-guard-"));
  const assets = join(root, "assets");
  await mkdir(assets);
  await mkdir(join(assets, "styles.css"));
  assert.deepEqual(missingAssetRefs(`"/assets/styles.css"`, assets), ["styles.css"]);
});
