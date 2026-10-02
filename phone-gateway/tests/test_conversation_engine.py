"""Unittests fuer die ConversationEngine (greeting/handle_segment/ended).

STT/TTS/Silvia-API werden gemockt, damit die Tests offline und deterministisch
laufen (kein laufender C:\\silvia-voice-Stack noetig).
"""
import unittest
from unittest.mock import patch

from lib import pipeline
from lib.audio_io import silence
from lib.pipeline import ConversationEngine
from lib.silvia_client import VoiceConfig


def _engine(**kw) -> ConversationEngine:
    cfg = VoiceConfig("http://127.0.0.1:8178", "http://127.0.0.1:8179")
    return ConversationEngine(voice_cfg=cfg, **kw)


class ConversationEngineTests(unittest.TestCase):
    def test_greeting_returns_text_and_appends_history(self):
        eng = _engine()
        with patch.object(pipeline, "synthesize", return_value=silence(0.1)):
            text, audio = eng.greeting()
        self.assertEqual(text, pipeline.GREETING_TEXT)
        self.assertEqual(eng.history[0], {"role": "assistant", "content": text})
        self.assertEqual(audio.rate, 16000)

    def test_handle_segment_falls_back_to_local_dialog_without_api(self):
        eng = _engine()  # api_url None -> lokaler Fallback-Dialog
        with patch.object(pipeline, "transcribe", return_value="Ich hätte gern einen Termin"), \
             patch.object(pipeline, "synthesize", return_value=silence(0.1)):
            transcript, reply, _audio = eng.handle_segment(silence(0.5))
        self.assertEqual(transcript, "Ich hätte gern einen Termin")
        self.assertIn("Termin", reply)
        self.assertFalse(eng.ended)

    def test_goodbye_sets_ended(self):
        eng = _engine()
        with patch.object(pipeline, "transcribe", return_value="Auf Wiederhören, tschüss"), \
             patch.object(pipeline, "synthesize", return_value=silence(0.1)):
            eng.handle_segment(silence(0.5))
        self.assertTrue(eng.ended)

    def test_api_end_call_sets_ended(self):
        eng = _engine(api_url="http://127.0.0.1:8080/api/telefon/antwort", api_token="tok", call_id="c1")
        with patch.object(pipeline, "transcribe", return_value="hallo"), \
             patch.object(pipeline, "synthesize", return_value=silence(0.1)), \
             patch.object(pipeline, "ask_silvia_api", return_value=("Auf Wiederhören", True)):
            eng.handle_segment(silence(0.5))
        self.assertTrue(eng.ended)


if __name__ == "__main__":
    unittest.main()
