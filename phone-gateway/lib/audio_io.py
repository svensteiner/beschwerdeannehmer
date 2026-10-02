"""WAV-Hilfsfunktionen: Lesen/Schreiben, Resample auf 16 kHz mono PCM16.

Bewusst ohne schwere Abhaengigkeiten (kein librosa) - reicht fuer
Telefonie-Audio (8/16 kHz, mono). Nutzt stdlib `wave` + `audioop` (Backport
`audioop-lts` unter Python 3.13) fuer Resampling.
"""
from __future__ import annotations

import array
import sys
import wave
from dataclasses import dataclass

try:
    import audioop  # py<=3.12 stdlib, sonst audioop-lts Backport
except ImportError as exc:  # pragma: no cover - Backport fehlt
    raise RuntimeError(
        "Modul 'audioop' fehlt. Unter Python 3.13 'pip install audioop-lts' "
        "(liegt in C:\\silvia-offline\\wheels)."
    ) from exc

TARGET_RATE = 16000
TARGET_WIDTH = 2  # 16 bit
TARGET_CHANNELS = 1


@dataclass
class PcmAudio:
    """Rohes PCM16-Mono-Audio bei fester Samplerate."""

    pcm: bytes
    rate: int = TARGET_RATE

    @property
    def duration_s(self) -> float:
        return len(self.pcm) / 2 / self.rate


def read_wav(path: str) -> PcmAudio:
    """Liest eine WAV-Datei und normalisiert auf 16 kHz / mono / 16 bit."""
    with wave.open(path, "rb") as wf:
        channels = wf.getnchannels()
        width = wf.getsampwidth()
        rate = wf.getframerate()
        raw = wf.readframes(wf.getnframes())

    pcm = raw
    if width != TARGET_WIDTH:
        pcm = audioop.lin2lin(pcm, width, TARGET_WIDTH)
    if channels > 1:
        pcm = audioop.tomono(pcm, TARGET_WIDTH, 0.5, 0.5)
    if rate != TARGET_RATE:
        pcm, _ = audioop.ratecv(pcm, TARGET_WIDTH, TARGET_CHANNELS, rate, TARGET_RATE, None)
    return PcmAudio(pcm=pcm, rate=TARGET_RATE)


def write_wav(path: str, audio: PcmAudio) -> None:
    with wave.open(path, "wb") as wf:
        wf.setnchannels(TARGET_CHANNELS)
        wf.setsampwidth(TARGET_WIDTH)
        wf.setframerate(audio.rate)
        wf.writeframes(audio.pcm)


def concat(*chunks: PcmAudio) -> PcmAudio:
    rate = chunks[0].rate if chunks else TARGET_RATE
    return PcmAudio(pcm=b"".join(c.pcm for c in chunks), rate=rate)


def silence(seconds: float, rate: int = TARGET_RATE) -> PcmAudio:
    n_bytes = int(seconds * rate) * 2
    return PcmAudio(pcm=b"\x00" * n_bytes, rate=rate)


# --- Telefonie-Anbindung (pyVoIP) -------------------------------------------
# pyVoIP dekodiert G.711 mu-law zu 8-bit-Linear bei 8 kHz (RTP.py::parse_pcmu
# nutzt audioop.ulaw2lin(..., 1) + bias(..., 128); Stille = 0x80) und erwartet
# beim Senden dasselbe Format. Die Pipeline (VAD/STT/TTS) arbeitet dagegen mit
# 16-bit-Linear bei 16 kHz. Diese Helfer wandeln an der Grenze um - ohne sie
# wuerde ein echter Anruf Rauschen statt Sprache liefern.
PHONE_RATE = 8000


def _u8_to_s16(pcm: bytes) -> bytes:
    """Unsigned 8-bit-Linear (pyVoIP, Stille=0x80) -> signed 16-bit-Linear."""
    src = array.array("B")
    src.frombytes(pcm)
    out = array.array("h")
    out.extend((b - 128) << 8 for b in src)
    return out.tobytes() if sys.byteorder == "little" else out.byteswap().tobytes()


def _s16_to_u8(pcm: bytes) -> bytes:
    """Signed 16-bit-Linear -> unsigned 8-bit-Linear (pyVoIP, Stille=0x80)."""
    src = array.array("h")
    src.frombytes(pcm)
    if sys.byteorder != "little":
        src.byteswap()
    out = array.array("B")
    out.extend(((v >> 8) + 128) & 0xFF for v in src)
    return out.tobytes()


def phone_to_pipeline(pcm: bytes) -> PcmAudio:
    """pyVoIP (8-bit, 8 kHz) -> Pipeline (16-bit, 16 kHz)."""
    s16_8k = _u8_to_s16(pcm)
    s16_16k, _ = audioop.ratecv(
        s16_8k, TARGET_WIDTH, TARGET_CHANNELS, PHONE_RATE, TARGET_RATE, None
    )
    return PcmAudio(pcm=s16_16k, rate=TARGET_RATE)


def pipeline_to_phone(audio: PcmAudio) -> bytes:
    """Pipeline (16-bit, 16 kHz) -> pyVoIP (8-bit, 8 kHz)."""
    s16 = audio.pcm
    if audio.rate != TARGET_RATE:
        s16, _ = audioop.ratecv(
            s16, TARGET_WIDTH, TARGET_CHANNELS, audio.rate, TARGET_RATE, None
        )
    s16_8k, _ = audioop.ratecv(
        s16, TARGET_WIDTH, TARGET_CHANNELS, TARGET_RATE, PHONE_RATE, None
    )
    return _s16_to_u8(s16_8k)
