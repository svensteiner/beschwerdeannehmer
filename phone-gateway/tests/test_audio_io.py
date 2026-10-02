"""Tests fuer die pyVoIP<->Pipeline-Codec-Grenze (8-bit/8 kHz <-> 16-bit/16 kHz)."""
import unittest

from lib.audio_io import (
    PHONE_RATE,
    _s16_to_u8,
    _u8_to_s16,
    phone_to_pipeline,
    pipeline_to_phone,
)


class PhoneCodecTests(unittest.TestCase):
    def test_u8_to_s16_known_values(self):
        # Stille (0x80) -> 0; volle Aussteuerung -> +/- 32512
        self.assertEqual(_u8_to_s16(b"\x80\x80"), b"\x00\x00\x00\x00")
        self.assertEqual(
            _u8_to_s16(b"\xff\x00"),
            (32512).to_bytes(2, "little", signed=True)
            + (-32768).to_bytes(2, "little", signed=True),
        )

    def test_s16_to_u8_known_values(self):
        self.assertEqual(_s16_to_u8(b"\x00\x00\x00\x00"), b"\x80\x80")
        self.assertEqual(_s16_to_u8((32767).to_bytes(2, "little", signed=True)), b"\xff")
        self.assertEqual(_s16_to_u8((-32768).to_bytes(2, "little", signed=True)), b"\x00")

    def test_silence_roundtrip_exact(self):
        # Stille ist bei pyVoIP 0x80; sie muss die Pipeline unbeschadet durchlaufen.
        phone_silence = bytes([0x80]) * PHONE_RATE
        pcm = phone_to_pipeline(phone_silence)
        self.assertEqual(pcm.rate, 16000)
        back = pipeline_to_phone(pcm)
        self.assertLessEqual(abs(len(back) - len(phone_silence)), 2)
        self.assertTrue(all(b == 0x80 for b in back))

    def test_tone_stays_centered_around_silence(self):
        # Ein 8-bit-"Ton" um die Stille (128) herum bleibt nach der Rundreise
        # um 128 zentriert und verliert nicht seine Aussteuerung.
        import array

        src = array.array("B", [128] * PHONE_RATE)
        for i in range(0, PHONE_RATE, 4):
            src[i] = 128 + 60
            src[i + 1] = 128 - 60
        back = pipeline_to_phone(phone_to_pipeline(src.tobytes()))
        self.assertTrue(any(b > 128 for b in back))
        self.assertTrue(any(b < 128 for b in back))


if __name__ == "__main__":
    unittest.main()
