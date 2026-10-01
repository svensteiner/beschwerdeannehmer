import assert from "node:assert/strict";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import {
  assertPgliteRestoreGzip,
  PGLITE_RESTORE_GZIP_ERROR,
} from "./pglite-restore-fs.ts";

// TS 5.7 tippt Uint8Array generisch (<ArrayBufferLike>), Blob verlangt aber
// <ArrayBuffer> — der Cast spiegelt nur die Laufzeit, wo Buffer/Uint8Array
// identisch sind.
const blob = (bytes: Uint8Array) =>
  new Blob([bytes as unknown as BlobPart], { type: "application/gzip" });
const gzip = (text: string) => new Uint8Array(gzipSync(Buffer.from(text)));
const corruptError = new RegExp(PGLITE_RESTORE_GZIP_ERROR.replace(/\./g, "\\."));

test("gültiges gzip besteht die Vorprüfung", async () => {
  await assertPgliteRestoreGzip(blob(gzip("create table practices (id text primary key)")));
});

test("beschädigtes gzip wird vor dem Einspielen abgelehnt", async () => {
  // gzip-Magie + kaputter Rest — darf die live-Tafel nie berühren.
  const corrupt = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x01, 0x02, 0x03]);
  await assert.rejects(() => assertPgliteRestoreGzip(blob(corrupt)), corruptError);
});

test("leere Datei ist kein gültiges gzip", async () => {
  await assert.rejects(() => assertPgliteRestoreGzip(blob(new Uint8Array(0))), corruptError);
});

test("abgeschnittenes gzip wird abgelehnt", async () => {
  const truncated = gzip("insert into practices values (1)").subarray(0, 8);
  await assert.rejects(() => assertPgliteRestoreGzip(blob(truncated)), corruptError);
});
