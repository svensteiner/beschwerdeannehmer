// Einmaliger, rein lokaler Premium-Hörproben-Generator.
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const text = `Grüß Gott, hier ist Silvia von der Tierordination.
Meine Hündin Bella braucht bitte einen Termin zur Kontrolle. Natürlich. Frisst und trinkt sie normal? Ja, alles wie immer. Das klingt beruhigend. Für eine genaue Einschätzung sprechen Sie bitte mit der Tierärztin.
Am Mittwochvormittag wäre noch ein Termin möglich. Das passt gut. Ich halte Ihre Anfrage fest. Bitte bringen Sie den Impfpass mit. Auf Wiederhören und alles Gute für Bella.`;
const output = fileURLToPath(new URL("../public/sounds/voices/silvia-premium-ramona.wav", import.meta.url));
const metadata = fileURLToPath(new URL("../public/sounds/voices/silvia-premium-ramona.json", import.meta.url));
if (existsSync(output) || existsSync(metadata)) throw new Error("Die lokale Premium-Probe existiert bereits; nicht überschreiben.");
const piper = process.env.PIPER_EXE ?? "C:\\silvia-voice\\.venv-piper\\Scripts\\piper.exe";
const model = process.env.PIPER_RAMONA_MODEL ?? "C:\\silvia-voice\\voices\\ramona-low.onnx";
const exitCode = await new Promise((resolve, reject) => {
  const child = spawn(piper, ["-m", model, "--sentence-silence", "0.2", "-f", output], {
    stdio: ["pipe", "ignore", "pipe"],
    windowsHide: true,
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", reject);
  child.on("close", (code) => {
    if (code !== 0) reject(new Error(`Lokales Piper-Modell konnte nicht erzeugen (${code}): ${stderr.trim()}`));
    else resolve(code);
  });
  child.stdin.end(text);
});
const audio = await readFile(output);
if (exitCode !== 0 || audio.subarray(0, 4).toString("ascii") !== "RIFF") throw new Error("Kein gültiges WAV erhalten");
// Erst nach erfolgreicher Erzeugung wird die begleitende Beschreibung geschrieben.
await writeFile(metadata, JSON.stringify({ model: "local-piper", voiceId: "ramona-low", configuredDefaultVoice: "ramona-low", localModel: "ramona-low.onnx", source: "lokal erzeugt im isolierten TTS-Testpfad", text, generatedAt: new Date().toISOString() }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, metadata, bytes: audio.length }));
