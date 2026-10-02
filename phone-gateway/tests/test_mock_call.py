"""Pflichttest AP 25: Mock-Gespraech ohne Registrar.

Voraussetzung: STT (8178) und TTS (8179) aus C:\\silvia-voice laufen.
Aufruf: python -m pytest tests/test_mock_call.py -v
(oder direkt: python tests/test_mock_call.py)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
import requests  # noqa: E402

from lib import silvia_client  # noqa: E402
from lib.silvia_client import VoiceConfig, notify_call_ended  # noqa: E402
from mock.make_mock_call import build_mock_call  # noqa: E402
from phone_gateway import run_mock  # noqa: E402

PFLICHT_SATZ = [
    "Gruess Gott, ich haette gern einen Termin fuer meine Katze Charlotte, "
    "meine Nummer ist 0680 1211520."
]


def _voice_stack_up() -> bool:
    cfg = VoiceConfig.from_env()
    try:
        requests.post(cfg.tts_url + "/v1/audio/speech", json={"input": "Test"}, timeout=45)
        return True
    except requests.RequestException:
        return False


@pytest.mark.skipif(not _voice_stack_up(), reason="STT/TTS (C:\\silvia-voice) laeuft nicht auf 8178/8179")
def test_mock_gespraech_termin_katze(tmp_path):
    anruf_wav = tmp_path / "anruf.wav"
    build_mock_call(PFLICHT_SATZ, str(anruf_wav))

    out_wav = run_mock(str(anruf_wav), out_dir=tmp_path)
    assert out_wav.exists()
    assert out_wav.stat().st_size > 0

    transcript_path = tmp_path / "transcript.json"
    data = json.loads(transcript_path.read_text(encoding="utf-8"))
    turns = data["turns"]

    user_texts = " ".join(t["text"] for t in turns if t["role"] == "user").lower()
    assert "termin" in user_texts or "katze" in user_texts, (
        f"Transkript enthaelt weder 'Termin' noch 'Katze': {user_texts!r}"
    )

    assistant_texts = [t["text"] for t in turns if t["role"] == "assistant"]
    assert assistant_texts, "keine Antwort generiert"
    last_reply = assistant_texts[-1]
    word_count = len(last_reply.split())
    assert word_count < 60, f"Antwort zu lang ({word_count} Woerter): {last_reply!r}"

    umlaut_hint = any(c in last_reply for c in "äöüßÄÖÜ") or any(
        w in last_reply.lower() for w in ["gerne", "ich", "notiere", "termin", "nummer", "danke"]
    )
    assert umlaut_hint, f"Antwort wirkt nicht deutsch: {last_reply!r}"


def test_notify_call_ended_sends_ended_true(monkeypatch):
    captured = {}

    class FakeResp:
        status_code = 200

    def fake_post_local_ai(url, **kwargs):
        captured["url"] = url
        captured["json"] = kwargs.get("json")
        captured["headers"] = kwargs.get("headers")
        return FakeResp()

    monkeypatch.setattr(silvia_client, "_post_local_ai", fake_post_local_ai)

    ok = notify_call_ended(
        [{"role": "user", "content": "hallo"}],
        "http://127.0.0.1:8080/api/telefon/antwort",
        "tok123",
        "call-1",
        "+436801234567",
    )

    assert ok is True
    assert captured["json"]["ended"] is True
    assert captured["json"]["callId"] == "call-1"


def test_notify_call_ended_returns_false_on_exception(monkeypatch):
    def fake_post_local_ai(*args, **kwargs):
        raise requests.exceptions.ConnectionError("boom")

    monkeypatch.setattr(silvia_client, "_post_local_ai", fake_post_local_ai)

    ok = notify_call_ended(
        [{"role": "user", "content": "hallo"}],
        "http://127.0.0.1:8080/api/telefon/antwort",
        "tok123",
        "call-1",
        "+436801234567",
    )

    assert ok is False


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
