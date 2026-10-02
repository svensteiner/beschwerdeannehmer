"""Erzeugt eine Mock-Anrufer-WAV (2-3 Aeusserungen per TTS, mit Pausen)
fuer den Registrar-losen Pflichttest von AP 25.

Aufruf: python mock/make_mock_call.py [ausgabe.wav] ["Satz 1" "Satz 2" ...]
Ohne Argumente wird der Pflicht-Testsatz verwendet.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.audio_io import concat, silence, write_wav  # noqa: E402
from lib.silvia_client import VoiceConfig, synthesize  # noqa: E402

DEFAULT_UTTERANCES = [
    "Gruess Gott, ich haette gern einen Termin fuer meine Katze Charlotte.",
    "Meine Nummer ist 0680 1211520.",
]


def build_mock_call(utterances: list[str], out_path: str, pause_s: float = 1.5) -> None:
    cfg = VoiceConfig.from_env()
    chunks = []
    for i, text in enumerate(utterances):
        if i > 0:
            chunks.append(silence(pause_s))
        chunks.append(synthesize(text, cfg))
    chunks.append(silence(pause_s))
    combined = concat(*chunks)
    write_wav(out_path, combined)
    print(f"Mock-Anruf geschrieben: {out_path} ({combined.duration_s:.1f}s, {len(utterances)} Aeusserungen)")


if __name__ == "__main__":
    args = sys.argv[1:]
    out = args[0] if args else "out/mock-anruf.wav"
    texts = args[1:] if len(args) > 1 else DEFAULT_UTTERANCES
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    build_mock_call(texts, out)
