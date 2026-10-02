"""Einfache energiebasierte Sprachaktivitaetserkennung (VAD).

webrtcvad hat unter Python 3.13 / ARM64-Emulation kein Wheel auf PyPI (nur
sdist, C-Build noetig) - siehe README.md ("Entscheidung"). Fuer Telefonie-
Audio (16 kHz mono PCM16) reicht ein energiebasierter Ansatz mit Hangover,
um Sprachsegmente von Stille zu trennen.
"""
from __future__ import annotations

from dataclasses import dataclass

from .audio_io import PcmAudio, TARGET_RATE

FRAME_MS = 30
DEFAULT_THRESHOLD = 350  # RMS-Schwelle fuer 16-bit PCM, empirisch fuer Sprache
HANGOVER_FRAMES = 10  # ~300 ms nachlaufen, bevor ein Segment endet


@dataclass
class Segment:
    start_s: float
    end_s: float
    audio: PcmAudio


def _frame_rms(frame: bytes) -> float:
    if not frame:
        return 0.0
    n = len(frame) // 2
    if n == 0:
        return 0.0
    total = 0
    for i in range(0, n * 2, 2):
        sample = int.from_bytes(frame[i : i + 2], "little", signed=True)
        total += sample * sample
    return (total / n) ** 0.5


def split_segments(
    audio: PcmAudio,
    threshold: float = DEFAULT_THRESHOLD,
    frame_ms: int = FRAME_MS,
    hangover_frames: int = HANGOVER_FRAMES,
    min_segment_s: float = 0.3,
) -> list[Segment]:
    """Teilt Audio in Sprachsegmente anhand der Frame-Energie (RMS)."""
    rate = audio.rate
    frame_bytes = int(rate * frame_ms / 1000) * 2
    frames = [audio.pcm[i : i + frame_bytes] for i in range(0, len(audio.pcm), frame_bytes)]

    segments: list[Segment] = []
    active = False
    hang = 0
    seg_start_frame = 0
    buf: list[bytes] = []

    for idx, frame in enumerate(frames):
        loud = _frame_rms(frame) >= threshold
        if loud:
            if not active:
                active = True
                seg_start_frame = idx
                buf = []
            buf.append(frame)
            hang = hangover_frames
        elif active:
            buf.append(frame)
            hang -= 1
            if hang <= 0:
                active = False
                seg_audio = PcmAudio(pcm=b"".join(buf), rate=rate)
                if seg_audio.duration_s >= min_segment_s:
                    segments.append(
                        Segment(
                            start_s=seg_start_frame * frame_ms / 1000,
                            end_s=(idx + 1) * frame_ms / 1000,
                            audio=seg_audio,
                        )
                    )
                buf = []

    if active and buf:
        seg_audio = PcmAudio(pcm=b"".join(buf), rate=rate)
        if seg_audio.duration_s >= min_segment_s:
            segments.append(
                Segment(
                    start_s=seg_start_frame * frame_ms / 1000,
                    end_s=len(frames) * frame_ms / 1000,
                    audio=seg_audio,
                )
            )
    return segments


def trailing_silence_s(audio: PcmAudio, threshold: float = DEFAULT_THRESHOLD, frame_ms: int = FRAME_MS) -> float:
    """Laenge der Stille am Ende des Audios (fuer Gespraechsende-Erkennung)."""
    rate = audio.rate
    frame_bytes = int(rate * frame_ms / 1000) * 2
    frames = [audio.pcm[i : i + frame_bytes] for i in range(0, len(audio.pcm), frame_bytes)]
    silent = 0
    for frame in reversed(frames):
        if _frame_rms(frame) < threshold:
            silent += 1
        else:
            break
    return silent * frame_ms / 1000
