import unittest
import os
from unittest.mock import patch

from lib.audio_io import PcmAudio
from lib.silvia_client import SilviaConfigError, VoiceConfig, ask_silvia_api, ask_silvia_brain, synthesize, transcribe
from lib import silvia_client


class _Response:
    status_code = 307
    text = "redirect"
    content = b"synthetic"

    def json(self):
        return {"text": "synthetic", "reply": "synthetic"}


class PrivacyClientTests(unittest.TestCase):
    def test_external_ai_targets_are_rejected_without_http(self):
        audio = PcmAudio(b"\x00\x00")
        cases = (
            lambda: transcribe(audio, VoiceConfig("https://api.openai.com", "http://127.0.0.1:8179")),
            lambda: synthesize("synthetic", VoiceConfig("http://127.0.0.1:8178", "https://api.openai.com")),
            lambda: ask_silvia_brain([], "https://api.openai.com"),
            lambda: ask_silvia_api([], "https://api.openai.com", "synthetic-token", "synthetic-call"),
        )
        with patch.object(silvia_client.requests, "Session", side_effect=AssertionError("HTTP")):
            for call in cases:
                with self.assertRaises(SilviaConfigError):
                    call()

    def test_url_credentials_and_non_loopback_are_rejected(self):
        for url in (
            "http://user:pass@127.0.0.1:8178",
            "http://192.0.2.1:8178",
            "http://example.invalid:8178",
        ):
            with self.assertRaises(SilviaConfigError):
                transcribe(PcmAudio(b"\x00\x00"), VoiceConfig(url, "http://127.0.0.1:8179"))

    def test_loopback_is_allowed_and_redirects_are_disabled(self):
        session = silvia_client.requests.Session()
        calls = []
        def fake_post(*args, **kwargs):
            calls.append((args, kwargs))
            return _Response()
        session.post = fake_post
        with patch.dict(os.environ, {"HTTP_PROXY": "http://198.51.100.7:3128", "HTTPS_PROXY": "http://198.51.100.7:3128"}), patch.object(silvia_client.requests, "Session", return_value=session):
            # The response is intentionally a synthetic redirect; requests must not follow it.
            with self.assertRaises(SilviaConfigError):
                ask_silvia_brain([], "http://127.0.0.1:8080/brain")
            self.assertFalse(calls[-1][1]["allow_redirects"])
            self.assertFalse(session.trust_env)


if __name__ == "__main__":
    unittest.main()
