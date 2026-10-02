"""HTTP-Clients fuer STT (8178), TTS (8179) und die Silvia-Antwortlogik.

STT/TTS-Vertraege sind aus C:\\silvia-voice\\stt_server.py /
tts_server.py 1:1 uebernommen (nicht geraten):
  POST {STT_URL}/v1/audio/transcriptions   multipart file= ; -> {"text": ...}
  POST {TTS_URL}/v1/audio/speech           json {input, voice, response_format}
                                            -> audio/wav bytes

Silvia-"Gehirn" (AP 27, Nachfolger von AP 25):
C:\\silvia hat jetzt eine dedizierte, dokumentierte HTTP-Route dafuer,
POST /api/telefon/antwort (C:\\silvia\\src\\routes\\api\\telefon\\antwort.ts),
token-geschuetzt und nur lokal/LAN erreichbar. `ask_silvia_api()` ruft sie auf:
  POST {SILVIA_API_URL}  Header Authorization: Bearer {SILVIA_PHONE_TOKEN}
  JSON {"callId": str, "from": str|None, "messages": [{"role","content"}, ...]}
  -> JSON {"reply": str, "source": "alma"|"local", "provider": str, "endCall": bool}
Ohne SILVIA_API_URL (nicht gesetzt) faellt der Gateway auf den lokalen,
regelbasierten Fallback-Dialog aus `lib/dialog.py` zurueck (Nichterreichbarkeit
ist der einzige Fallback-Fall - eine falsche/fehlende Token-Konfiguration bei
GESETZTER SILVIA_API_URL wird laut Governance NICHT still uebergangen, sondern
wirft SilviaConfigError). `ask_silvia_brain()` (AP 25, einfacherer Vertrag ohne
Token/callId) bleibt als Altlast fuer eine selbstgebaute Bridge erhalten, wird
vom Gateway aber nicht mehr aufgerufen. Siehe README "Silvia-API (AP 27)".
"""
from __future__ import annotations

import io
import ipaddress
import logging
import os
import wave
from dataclasses import dataclass
from urllib.parse import urlsplit

import requests

from .audio_io import PcmAudio, write_wav

logger = logging.getLogger("silvia_phone.client")


class SilviaConfigError(RuntimeError):
    """Sauber gemeldeter Konfigurations-/Verbindungsfehler (kein Absturz mit Stacktrace fuer den Betreiber)."""


def _validate_local_ai_url(url: str, label: str) -> None:
    """Erlaubt fuer KI-Verarbeitung nur HTTP(S) zu einem Loopback-Ziel.

    Ausser ``localhost`` sind nur Loopback-IP-Literale zulaessig.
    Die lokale Namensaufloesung und lokale Weiterleiter bleiben Betriebsgrenzen.
    """
    try:
        parsed = urlsplit(url)
        if parsed.scheme not in {"http", "https"}:
            raise SilviaConfigError(f"{label} muss http:// oder https:// verwenden")
        if parsed.username is not None or parsed.password is not None:
            raise SilviaConfigError(f"{label} darf keine Zugangsdaten in der URL enthalten")
        if parsed.query or parsed.fragment:
            raise SilviaConfigError(f"{label} darf keine Query/Fragment-Teile enthalten")
        host = parsed.hostname
        if not host:
            raise SilviaConfigError(f"{label} ohne Host")
        host = host.rstrip(".").lower()
        if host == "localhost":
            return
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            raise SilviaConfigError(f"{label} muss auf Loopback zeigen") from None
        if not address.is_loopback:
            raise SilviaConfigError(f"{label} muss auf Loopback zeigen")
    except ValueError as exc:
        raise SilviaConfigError(f"ungueltige {label}: {exc}") from exc


def _post_local_ai(url: str, **kwargs):
    """POST fuer KI-Routen ohne automatische Weiterleitungen."""
    _validate_local_ai_url(url, "KI-Ziel")
    # trust_env=False verhindert, dass HTTP_PROXY/HTTPS_PROXY den lokalen
    # Audio-/Transkriptionsverkehr an einen externen Proxy umleitet.
    with requests.Session() as session:
        session.trust_env = False
        return session.post(url, allow_redirects=False, **kwargs)


@dataclass
class VoiceConfig:
    stt_url: str
    tts_url: str
    stt_timeout_s: float = 90.0
    tts_timeout_s: float = 90.0

    @classmethod
    def from_env(cls) -> "VoiceConfig":
        return cls(
            stt_url=os.environ.get("STT_URL", "http://127.0.0.1:8178").rstrip("/"),
            tts_url=os.environ.get("TTS_URL", "http://127.0.0.1:8179").rstrip("/"),
        )


def _pcm_to_wav_bytes(audio: PcmAudio) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(audio.rate)
        wf.writeframes(audio.pcm)
    return buf.getvalue()


def transcribe(audio: PcmAudio, cfg: VoiceConfig, language: str = "de") -> str:
    """Ruft STT (Port 8178) auf. Wirft SilviaConfigError bei Verbindungs-/HTTP-Fehlern."""
    wav_bytes = _pcm_to_wav_bytes(audio)
    url = f"{cfg.stt_url}/v1/audio/transcriptions"
    try:
        resp = _post_local_ai(
            url,
            data={"language": language, "response_format": "json"},
            files={"file": ("segment.wav", wav_bytes, "audio/wav")},
            timeout=cfg.stt_timeout_s,
        )
    except requests.RequestException as exc:
        raise SilviaConfigError(f"STT nicht erreichbar unter {url}: {exc}") from exc
    if resp.status_code != 200:
        raise SilviaConfigError(f"STT-Fehler {resp.status_code} von {url}")
    try:
        payload = resp.json()
    except ValueError as exc:
        raise SilviaConfigError(f"STT-Antwort kein JSON (HTTP {resp.status_code})") from exc
    return str(payload.get("text", "")).strip()


def synthesize(text: str, cfg: VoiceConfig, voice: str = "ara") -> PcmAudio:
    """Ruft TTS (Port 8179) auf und liefert PCM16/16kHz-Audio zurueck."""
    url = f"{cfg.tts_url}/v1/audio/speech"
    try:
        resp = _post_local_ai(
            url,
            json={"input": text, "voice": voice, "response_format": "wav"},
            timeout=cfg.tts_timeout_s,
        )
    except requests.RequestException as exc:
        raise SilviaConfigError(f"TTS nicht erreichbar unter {url}: {exc}") from exc
    if resp.status_code != 200:
        raise SilviaConfigError(f"TTS-Fehler {resp.status_code} von {url}")

    from .audio_io import read_wav
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(resp.content)
        tmp_path = tmp.name
    try:
        return read_wav(tmp_path)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def ask_silvia_brain(history: list[dict], brain_url: str | None, timeout_s: float = 30.0) -> str | None:
    """Optionale Bridge zur Silvia-Antwortlogik.

    Vertrag (vom Gateway vorgegeben, da askAlma keine stabile HTTP-API hat):
      POST {brain_url}  JSON {"messages": [{"role": "user"|"assistant", "content": str}, ...]}
      -> JSON {"reply": str}

    Gibt None zurueck, wenn keine brain_url konfiguriert ist (Aufrufer nutzt
    dann den lokalen Fallback-Dialog). Wirft SilviaConfigError bei Fehlern,
    wenn eine URL konfiguriert wurde (damit Fehlkonfiguration nicht still
    verschluckt wird).
    """
    if not brain_url:
        return None
    try:
        resp = _post_local_ai(brain_url, json={"messages": history}, timeout=timeout_s)
    except requests.RequestException as exc:
        raise SilviaConfigError(f"Silvia-Bridge nicht erreichbar unter {brain_url}: {exc}") from exc
    if resp.status_code != 200:
        raise SilviaConfigError(f"Silvia-Bridge-Fehler {resp.status_code}")
    try:
        payload = resp.json()
    except ValueError as exc:
        raise SilviaConfigError(f"Silvia-Bridge-Antwort kein JSON (HTTP {resp.status_code})") from exc
    reply = payload.get("reply")
    if not isinstance(reply, str) or not reply.strip():
        raise SilviaConfigError("Silvia-Bridge-Antwort ohne 'reply'-Text")
    return reply.strip()


def ask_silvia_api(
    history: list[dict],
    api_url: str | None,
    token: str | None,
    call_id: str,
    caller_from: str | None = None,
    # AP 28: 30s war auf diesem CPU-gebundenen (ARM64-Emulation) Rechner zu knapp -
    # Ollama/qwen2.5:3b braucht unter Last gelegentlich laenger, siehe AP21/27
    # (10-19s Ø, Ausreisser bis ~19s beobachtet, plus Netzwerk/TTS-Kette danach).
    # Gleicher Wert wie STT/TTS-Timeouts in VoiceConfig (siehe oben).
    timeout_s: float = 90.0,
) -> tuple[str, bool] | None:
    """Ruft Silvias Telefon-Antwort-Route auf (AP 27, POST /api/telefon/antwort).

    Gibt (reply_text, end_call) zurueck, oder None wenn keine api_url konfiguriert
    ist (Aufrufer nutzt dann den lokalen Fallback-Dialog aus lib/dialog.py - das
    ist der einzige vorgesehene Fallback-Fall). Wirft SilviaConfigError bei
    Fehlkonfiguration (z. B. api_url gesetzt, aber kein Token) oder bei
    Netzwerk-/HTTP-/Antwortfehlern, damit ein Fehlkonfigurations-Fall nicht
    still im lokalen Fallback verschwindet (Governance: kein stiller Live-
    Wechsel der Antwortquelle).
    """
    if not api_url:
        return None
    if not token:
        raise SilviaConfigError(
            "SILVIA_API_URL ist gesetzt, aber SILVIA_PHONE_TOKEN fehlt in .env."
        )
    try:
        resp = _post_local_ai(
            api_url,
            json={"callId": call_id, "from": caller_from, "messages": history},
            headers={"Authorization": f"Bearer {token}"},
            timeout=timeout_s,
        )
    except requests.RequestException as exc:
        raise SilviaConfigError(f"Silvia-API nicht erreichbar unter {api_url}: {exc}") from exc
    if resp.status_code != 200:
        raise SilviaConfigError(f"Silvia-API-Fehler {resp.status_code} von {api_url}")
    try:
        payload = resp.json()
    except ValueError as exc:
        raise SilviaConfigError(f"Silvia-API-Antwort kein JSON (HTTP {resp.status_code})") from exc
    reply = payload.get("reply")
    if not isinstance(reply, str) or not reply.strip():
        raise SilviaConfigError("Silvia-API-Antwort ohne 'reply'-Text")
    return reply.strip(), bool(payload.get("endCall", False))


def notify_call_ended(
    history: list[dict],
    api_url: str | None,
    token: str | None,
    call_id: str,
    caller_from: str | None = None,
    timeout_s: float = 5.0,
) -> bool:
    """Meldet Silvia (AP 27-Route, siehe oben) das Ende eines Anrufs (AP 56).

    Nutzt dieselbe Route wie ask_silvia_api(), zusaetzlich mit "ended": True,
    damit Silvia den Gespraechsabschluss erkennt. Darf den Gateway niemals
    zum Absturz bringen (kein Crash beim Aufraeumen eines Anrufs): faengt
    jeden Fehler ab und gibt True/False zurueck statt zu werfen. Loggt bei
    Fehlern nur die Exception-Klasse, keine Anrufer-/Inhaltsdaten (PII).
    """
    if not api_url:
        return False
    try:
        resp = _post_local_ai(
            api_url,
            json={"callId": call_id, "from": caller_from, "messages": history, "ended": True},
            headers={"Authorization": f"Bearer {token}"} if token else {},
            timeout=timeout_s,
        )
        return 200 <= resp.status_code < 300
    except Exception as exc:  # noqa: BLE001 - darf nie durchschlagen
        logger.warning("notify_call_ended failed: %s", type(exc).__name__)
        return False
