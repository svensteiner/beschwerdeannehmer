"""Gemeinsame Gespraechs-Pipeline fuer Mock- und SIP-Modus.

Begruessung (TTS) -> Segment (VAD) -> STT -> Antwort (Silvia-API, AP 27, oder
lokaler Fallback) -> TTS. Auflegen bei "Auf Wiederhoeren" im Anrufer-Transkript,
wenn die Silvia-API selbst ein Gespraechsende signalisiert (endCall) oder (vom
Aufrufer gesteuert) bei > 8 s Stille.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from . import dialog
from .audio_io import PcmAudio
from .silvia_client import SilviaConfigError, VoiceConfig, ask_silvia_api, synthesize, transcribe

GREETING_TEXT = dialog.GREETING
END_SILENCE_S = 8.0


@dataclass
class Turn:
    transcript: str
    reply_text: str


@dataclass
class ConversationEngine:
    voice_cfg: VoiceConfig
    api_url: str | None = None
    api_token: str | None = None
    call_id: str = "mock"
    caller_from: str | None = None
    history: list[dict] = field(default_factory=list)
    turns: list[Turn] = field(default_factory=list)
    ended: bool = False

    def greeting(self) -> tuple[str, PcmAudio]:
        audio = synthesize(GREETING_TEXT, self.voice_cfg)
        self.history.append({"role": "assistant", "content": GREETING_TEXT})
        return GREETING_TEXT, audio

    def handle_segment(self, segment_audio: PcmAudio) -> tuple[str, str, PcmAudio]:
        """STT -> Antwort -> TTS fuer ein Sprachsegment des Anrufers."""
        transcript = transcribe(segment_audio, self.voice_cfg)
        self.history.append({"role": "user", "content": transcript})

        reply_text: str | None = None
        end_call = False
        try:
            api_result = ask_silvia_api(
                self.history,
                self.api_url,
                self.api_token,
                self.call_id,
                self.caller_from,
            )
        except SilviaConfigError:
            raise  # Konfigurationsfehler muessen sauber nach oben durchgereicht werden
        if api_result is not None:
            reply_text, end_call = api_result
        if reply_text is None:
            reply_text = dialog.local_reply(transcript)

        self.history.append({"role": "assistant", "content": reply_text})
        reply_audio = synthesize(reply_text, self.voice_cfg)
        self.turns.append(Turn(transcript=transcript, reply_text=reply_text))

        if end_call or dialog.is_goodbye(transcript):
            self.ended = True
        return transcript, reply_text, reply_audio
