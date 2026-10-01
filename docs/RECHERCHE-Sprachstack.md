# GESPERRT — historische Recherche zum Sprach-Stack

**Nicht als Architektur- oder Migrationsplan verwenden.** Stand des
historischen Textes: 09.09.2026. Seine Empfehlung, Gespräche über OpenAI,
Deepgram, Azure oder andere externe Sprachdienste zu verarbeiten, ist für den
Praxisbetrieb unzulässig.

Verbindlich gilt: **Echte Praxisdaten und Audioinhalte gehen niemals an
externe KI-Dienste.** Der aktuelle Praxispfad nutzt deshalb lokale
Spracherkennung, lokale Antwortlogik und lokale Ausgabe. Die getrennte
Cloud-Live-Hörprobe ist nur für erfundene Inhalte in einer RAM-Sandbox
vorgesehen und kein Praxisgespräch.

Der folgende Text ist ausschließlich eine historische Marktübersicht. Er darf
keine Implementierung, Anbieterwahl oder Datenübertragung auslösen.

## Historische Marktübersicht

## Bausteine

| Baustein | Empfehlung | Details |
|---|---|---|
| VAD im Browser | `@ricky0123/vad` (vad-web) | Silero-VAD als ONNX, AudioWorklet, ISC-Lizenz, ~1,9k Stars, aktiv. https://github.com/ricky0123/vad |
| Streaming-STT | OpenAI `gpt-4o-mini-transcribe` (~$0,003/min) über bestehende Server-Route | Whisper-Familie, gutes Deutsch. Realtime-API per WebRTC möglich |
| STT-Alternative | Deepgram Nova-3 (~$0,005–0,008/min), Azure Speech SDK JS | Deutsch ja, österreichischer Dialekt/Tiermedizin-Vokabular unverifiziert |
| On-Device | whisper.cpp WASM, transformers.js Whisper, Vosk | keine Cloudkosten, aber CPU-Last und schlechtere Fachbegriffe, zweite Wahl |
| Full-Duplex-Framework | LiveKit Agents (Apache-2.0, selbst hostbar) | nur wenn Telefonie (SIP) und Browser aus einer Hand; für Einzelpraxis zu schwer |
| Managed | Vapi, ElevenLabs Conversational AI | schnell, aber laufende Kosten und Abhängigkeit, Overkill für die Architektur |
| TTS | OpenAI `gpt-4o-mini-tts` / `tts-1-hd` beibehalten | Premium: Azure Neural (de-AT unverifiziert), ElevenLabs |

## Audio-Hygiene im Browser
- `getUserMedia` mit `echoCancellation`, `noiseSuppression`, `autoGainControl` (ist heute schon so).
- AudioWorklet statt `ScriptProcessorNode`, Resampling auf 16 kHz PCM.
- `MediaRecorder` unter Windows-Chrome meiden (Codec-Inkonsistenzen); PCM-Frames per WebSocket senden.

## Empfohlener Stack

**Stufe 1 (günstig, zuverlässig):** vad-web für Sprechpausen und Barge-in, AudioWorklet → 16 kHz PCM →
bestehende Nitro-Route mit gpt-4o-mini-transcribe, TTS bleibt OpenAI. Kosten etwa $0,003 pro Minute STT.

**Stufe 2 (Premium):** Deepgram oder Azure als STT im A/B-Test für Dialekt, LiveKit Agents nur bei SIP-Telefonie,
Azure de-AT-Stimme oder ElevenLabs für natürlicheres Österreichisch.

## Migrationsplan in 5 Schritten
1. vad-web in die Demo integrieren, Sprechpausen statt Chrome-SpeechRecognition-Events.
2. Bestehende Transcribe-Route als WebSocket-Endpoint für PCM-Chunks öffnen, Demo und Live-Pfad vereinheitlichen.
3. Constraints und AudioWorklet-Resampler auf Windows-Chrome testen.
4. Barge-in: TTS stoppen, sobald VAD neue Sprache erkennt.
5. Fehler sichtbar machen (kein stilles Scheitern), VAD-Events und STT-Latenz loggen.

Offen: de-AT-Stimmen bei Azure, Deepgram-Qualität für Österreichisch, Release-Stand von vad-web.
