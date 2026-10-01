// One-off recording, never invoked by visitors. Requires ws (path via SILVIA_WS_MODULE).
// Docs: https://developers.openai.com/api/docs/guides/voice-websockets?api=live
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
if (args.length !== 1 || args[0] !== '--confirm-synthetic') {
  throw new Error('Nur mit --confirm-synthetic ausführen; ausschließlich synthetische Hörprobe.');
}
const proxyVariables = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'];
const configuredProxy = proxyVariables.find((name) => String(process.env[name] ?? '').trim());
if (configuredProxy) throw new Error(`${configuredProxy} ist gesetzt; Proxy-Verbindungen sind für die Hörprobe verboten.`);
if (String(process.env.DATABASE_URL ?? '').trim()) throw new Error('DATABASE_URL darf für die Hörprobe nicht gesetzt sein.');
if (String(process.env.SILVIA_DATA_DIR ?? '').trim()) throw new Error('SILVIA_DATA_DIR darf für die Hörprobe nicht gesetzt sein.');

const { default: WebSocket } = await import(process.env.SILVIA_WS_MODULE
  ? pathToFileURL(process.env.SILVIA_WS_MODULE).href : 'ws');
if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY fehlt.');
const output = fileURLToPath(new URL('../public/sounds/voices/silvia-live-marin.wav', import.meta.url));
if (existsSync(output)) throw new Error('Hörprobe existiert bereits; kein automatisches Überschreiben.');
const chunks = [];
let transcript = '';
let finalized = false;
let closing = false;
let inputTimer;
let recordingTimer;
const ws = new WebSocket('wss://api.openai.com/v1/live/sessions', {
  headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
});
const send = (event) => ws.send(JSON.stringify(event));
const cleanup = () => { clearInterval(inputTimer); clearTimeout(recordingTimer); clearTimeout(hardTimeout); };
const hardTimeout = setTimeout(() => {
  console.error('Live-Aufnahme abgebrochen: Zeitlimit.');
  process.exitCode = 1;
  cleanup();
  ws.terminate();
}, 55000);
ws.on('open', () => send({ type: 'session.start', session: {
  model: 'gpt-live-1', store: false,
  instructions: 'Du bist Silvia, eine KI-Rezeption für österreichische Tierordinationen. Sprich warm, natürlich, ruhig und freundlich auf österreichischem Hochdeutsch. Dies ist nur eine kurze Hörprobe. Keine echten Termine, keine Patientendaten, keine Werkzeuge. Nach der Begrüßung schweigen und zuhören.',
  audio: { format: { type: 'audio/pcm', rate: 24000 }, output: { voice: 'marin' } },
} }));
ws.on('message', (raw) => {
  const event = JSON.parse(raw.toString());
  if (event.type === 'session.started') {
    console.log('GPT-Live gestartet:', event.session?.model);
    send({ type: 'session.instructions.append', event_id: 'greeting', delegation_id: null,
      content: 'Begrüße jetzt sofort auf Deutsch, ohne auf den Anrufer zu warten. Sage: Grüß Gott, hier ist Silvia, die digitale Rezeption Ihrer Tierordination. Schön, dass Sie anrufen. Ob Sie einen Termin brauchen oder eine Frage haben: Erzählen Sie mir in Ruhe, worum es geht. Danach schweige und höre zu.' });
    inputTimer = setInterval(() => {
      if (!closing && ws.readyState === WebSocket.OPEN)
        send({ type: 'session.input_audio.append', audio: Buffer.alloc(4800).toString('base64') });
    }, 100);
    recordingTimer = setTimeout(() => { closing = true; clearInterval(inputTimer); send({ type: 'session.close' }); }, 30000);
  } else if (event.type === 'session.output_audio.delta') {
    chunks.push(Buffer.from(event.delta, 'base64'));
  } else if (event.type === 'session.output_transcript.delta') {
    transcript += event.delta;
  } else if (event.type === 'error') {
    console.error('Live-Fehler:', event.error?.code, event.error?.message);
    process.exitCode = 1;
    cleanup(); ws.close();
  } else if (event.type === 'session.closed') {
    finalized = true; cleanup(); ws.terminate();
    const pcm = Buffer.concat(chunks);
    if (pcm.length < 48000 || !transcript.trim()) { process.exitCode = 1; console.error('Keine brauchbare Hörprobe.'); return; }
    const header = Buffer.alloc(44);
    header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
    header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
    header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28); header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
    writeFileSync(output, Buffer.concat([header, pcm]), { flag: 'wx' });
    writeFileSync(output.replace('.wav', '.json'), JSON.stringify({ model: 'gpt-live-1', voice: 'marin',
      generatedAt: new Date().toISOString(), transcript, usage: event.usage, reason: event.reason,
      audioSeconds: pcm.length / 48000 }, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ transcript, usage: event.usage, audioSeconds: pcm.length / 48000 }));
  }
});
ws.on('error', (error) => { console.error(error.message); process.exitCode = 1; cleanup(); });
ws.on('close', () => { cleanup(); if (!finalized) { process.exitCode = 1; console.error('Sitzung nicht bestätigt abgeschlossen.'); } });
