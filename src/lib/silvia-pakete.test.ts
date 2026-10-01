import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { SILVIA_PAKETE } from "./silvia-pakete.ts";

test("Paket-Hörproben unterscheiden Premium und Live ehrlich", () => {
  const premium = SILVIA_PAKETE.find((paket) => paket.id === "premium");
  assert.ok(premium);
  assert.equal(premium.description, "Warme weibliche Stimme · lokal");
  assert.match(premium.status, /lokal erzeugte Stimme/);
  assert.match(premium.status, /vorbereiteter Beispieltext/);
  assert.equal(premium.audioSrc, "/sounds/voices/silvia-premium-ramona.wav");

  const live = SILVIA_PAKETE.find((paket) => paket.id === "live");
  assert.ok(live);
  assert.match(live.description, /GPT-Live-1 mit Marin/);
  assert.match(live.description, /separate Demo/);
  assert.match(live.usageNotice ?? "", /nur als Demo mit erfundenen Inhalten/);
  assert.match(live.usageNotice ?? "", /nicht für echte Praxisgespräche/);
});

test("Paket-Hörproben sind technisch verschiedene WAV-Dateien", () => {
  const files = SILVIA_PAKETE.map((paket) =>
    readFileSync(fileURLToPath(new URL(`../../public${paket.audioSrc}`, import.meta.url))),
  );
  assert.equal(files.every((file) => file.toString("ascii", 0, 4) === "RIFF"), true);
  assert.notDeepEqual(files[0], files[1]);
  assert.notEqual(files[0].readUInt32LE(24), files[1].readUInt32LE(24));
  assert.notEqual(files[0].readUInt32LE(40), files[1].readUInt32LE(40));
});

test("Live-Hörprobe bleibt zur GPT-Live-1-Marin-Metadatei passend", () => {
  const wav = readFileSync(
    fileURLToPath(new URL("../../public/sounds/voices/silvia-live-marin.wav", import.meta.url)),
  );
  const metadata = JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../public/sounds/voices/silvia-live-marin.json", import.meta.url)),
      "utf8",
    ),
  ) as { model?: unknown; voice?: unknown; audioSeconds?: unknown; transcript?: unknown };
  assert.equal(metadata.model, "gpt-live-1");
  assert.equal(metadata.voice, "marin");
  assert.match(String(metadata.transcript ?? ""), /Grüß Gott/);
  const seconds = wav.readUInt32LE(40) / wav.readUInt32LE(28);
  assert.ok(Math.abs(seconds - Number(metadata.audioSeconds)) < 0.1);
});
