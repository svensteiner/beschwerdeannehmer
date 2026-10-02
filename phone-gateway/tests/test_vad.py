"""Unittests fuer die energiebasierte VAD (lib/vad.py), offline und deterministisch."""
import math
import struct
import unittest

from lib.audio_io import PcmAudio, silence
from lib.vad import split_segments, trailing_silence_s


def _tone(seconds: float, freq: float = 440.0, rate: int = 16000, amp: int = 8000) -> PcmAudio:
    n = int(seconds * rate)
    out = bytearray()
    for i in range(n):
        v = int(amp * math.sin(2 * math.pi * freq * i / rate))
        out += struct.pack("<h", v)
    return PcmAudio(pcm=bytes(out), rate=rate)


def _cat(*chunks: PcmAudio) -> PcmAudio:
    return PcmAudio(pcm=b"".join(c.pcm for c in chunks), rate=16000)


class VadTests(unittest.TestCase):
    def test_two_tone_bursts_yield_two_segments(self):
        audio = _cat(
            silence(0.5), _tone(0.8), silence(0.5), _tone(0.8), silence(0.5)
        )
        segs = split_segments(audio)
        self.assertEqual(len(segs), 2)

    def test_silence_yields_no_segments(self):
        segs = split_segments(silence(1.0))
        self.assertEqual(segs, [])

    def test_trailing_silence_measures_end_silence(self):
        audio = _cat(_tone(0.5), silence(1.0))
        s = trailing_silence_s(audio)
        self.assertGreaterEqual(s, 0.9)


if __name__ == "__main__":
    unittest.main()
