#!/usr/bin/env python3
"""Silvia Telefonie-Gateway (AP 25, Antwortquelle seit AP 27: Silvia-API).

Modi:
  --mock <anruf.wav>   Registrar-loser Pflichttest: spielt eine Anrufer-WAV
                        ein, fuehrt die volle Pipeline (VAD -> STT -> Antwort
                        -> TTS) aus, schreibt out/gespraech-<datum>.wav und
                        transcript.json.
  --sip                 Registriert sich per SIP (pyVoIP) am Registrar aus
                        .env und nimmt echte Anrufe an. Ohne echten
                        Registrar meldet dieser Modus einen sauberen
                        Konfigurationsfehler statt abzustuerzen.

Governance/Scope (siehe README): Mock-Modus ist Pflicht und Abnahme-
kriterium. SIP-Registrierung ist implementiert, aber nur fuer einen
FritzBox-Betrieb im eigenen LAN freigegeben (unverschluesseltes SIP/RTP
nur zu privaten LAN-Registraren, nie zu oeffentlichen IPs).
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.audio_io import (  # noqa: E402
    PHONE_RATE,
    concat,
    phone_to_pipeline,
    pipeline_to_phone,
    read_wav,
    silence,
    write_wav,
)
from lib.network_guard import is_private_lan_target  # noqa: E402
from lib.pipeline import END_SILENCE_S, ConversationEngine  # noqa: E402
from lib.silvia_client import SilviaConfigError, VoiceConfig, notify_call_ended  # noqa: E402
from lib.vad import split_segments  # noqa: E402

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
logger = logging.getLogger("silvia_phone")

PLAIN_SIP_ACK_ENV = "SILVIA_PHONE_ALLOW_UNENCRYPTED_LAN"

# pyVoIP liest/liefert 8-bit-Linear bei 8 kHz (siehe lib/audio_io.py). 320 Byte
# = 320 Samples = 40 ms Telefon-Audio. PROCESS_WINDOW_BYTES = 1 s Fenster, bevor
# VAD/STT laufen. HARD_CALL_TIMEOUT_S schuetzt vor halb-offenen Anrufen.
READ_CHUNK_BYTES = 320
READ_PACE_S = 0.04
PROCESS_WINDOW_BYTES = PHONE_RATE
HARD_CALL_TIMEOUT_S = 600.0


def plain_sip_acknowledged(env=None) -> bool:
    """pyVoIP has no TLS/SRTP mode; require a deliberate isolated-LAN opt-in."""
    source = os.environ if env is None else env
    return str(source.get(PLAIN_SIP_ACK_ENV, "")).strip() == "1"


def _parse_sip_port(name: str, default: str = "5060") -> int:
    """Liest einen SIP-Port aus der Umgebung; sauberer Fehler bei Muell."""
    raw = os.environ.get(name, default)
    try:
        port = int(raw)
    except (TypeError, ValueError) as exc:
        raise SilviaConfigError(f"{name} muss eine ganze Zahl sein (aktuell: {raw!r}).") from exc
    if not 1 <= port <= 65535:
        raise SilviaConfigError(f"{name} ausserhalb des gueltigen Bereichs 1-65535: {port}.")
    return port


def _out_dir() -> Path:
    d = Path(__file__).resolve().parent / "out"
    d.mkdir(parents=True, exist_ok=True)
    return d


def run_mock(anruf_wav: str, out_dir: Path | None = None, caller_from: str | None = None) -> Path:
    """Fuehrt den Pflichttest-Modus ohne Registrar aus."""
    out_dir = out_dir or _out_dir()
    voice_cfg = VoiceConfig.from_env()
    api_url = os.environ.get("SILVIA_API_URL") or None
    api_token = os.environ.get("SILVIA_PHONE_TOKEN") or None
    call_id = f"mock-{uuid.uuid4().hex[:12]}"
    engine = ConversationEngine(
        voice_cfg=voice_cfg,
        api_url=api_url,
        api_token=api_token,
        call_id=call_id,
        caller_from=caller_from,
    )

    caller_audio = read_wav(anruf_wav)
    segments = split_segments(caller_audio)
    if not segments:
        raise SilviaConfigError(
            f"Keine Sprachsegmente in {anruf_wav} gefunden (VAD-Schwelle zu hoch "
            "oder Datei zu leise/leer)."
        )

    timeline = []
    greeting_text, greeting_audio = engine.greeting()
    timeline.append(greeting_audio)
    transcript_log = [{"role": "assistant", "text": greeting_text, "t": 0.0}]

    for seg in segments:
        timeline.append(silence(0.3))
        transcript, reply_text, reply_audio = engine.handle_segment(seg.audio)
        transcript_log.append({"role": "user", "text": transcript, "t": seg.start_s})
        transcript_log.append({"role": "assistant", "text": reply_text, "t": seg.end_s})
        timeline.append(reply_audio)
        if engine.ended:
            break

    result_audio = concat(*timeline)
    stamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    out_wav = out_dir / f"gespraech-{stamp}.wav"
    write_wav(str(out_wav), result_audio)

    out_json = out_dir / "transcript.json"
    out_json.write_text(
        json.dumps(
            {
                "input": str(anruf_wav),
                "output_wav": str(out_wav),
                "mode": "mock",
                "callId": call_id,
                "brain": "silvia-api" if api_url else "local-fallback",
                "turns": transcript_log,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    logger.info("Mock-Gespraech abgeschlossen: %s", out_wav)
    logger.info("Transkript: %s", out_json)
    return out_wav


def run_sip() -> None:
    """SIP-Registrierung + Anrufannahme. Ohne Registrar -> sauberer Fehler."""
    required = ["SIP_SERVER", "SIP_USER", "SIP_PASS"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        raise SilviaConfigError(
            f"SIP-Konfiguration unvollstaendig, es fehlen: {', '.join(missing)} "
            "(.env pruefen: SIP_SERVER, SIP_USER, SIP_PASS, SIP_PORT)."
        )

    if not plain_sip_acknowledged():
        raise SilviaConfigError(
            "Unverschluesseltes SIP/RTP ist standardmaessig gesperrt: pyVoIP "
            "unterstuetzt hier weder TLS noch SRTP. Nur fuer einen isolierten "
            "Test mit erfundenen Inhalten darf SILVIA_PHONE_ALLOW_UNENCRYPTED_LAN=1 "
            "gesetzt werden. Kein Praxisbetrieb mit echten Gesprächen."
        )

    # Konfiguration VOR dem pyVoIP-Import parsen/pruefen, damit Fehlkonfiguration
    # (falscher Port, oeffentlicher Registrar) ohne pyVoIP sauber gemeldet wird.
    server = os.environ["SIP_SERVER"]
    port = _parse_sip_port("SIP_PORT")
    local_port = _parse_sip_port("SIP_LOCAL_PORT")
    user = os.environ["SIP_USER"]
    password = os.environ["SIP_PASS"]

    # Maschinelle LAN-Grenze: unverschluesseltes SIP nur zu privaten Registraren.
    if not is_private_lan_target(server):
        raise SilviaConfigError(
            "SIP_SERVER zeigt auf eine oeffentliche IP (kein privates LAN). "
            "Unverschluesseltes SIP/RTP ist nur zu einem Registrar im eigenen "
            "LAN zulaessig (z. B. FritzBox vor Ort)."
        )

    try:
        from pyVoIP.VoIP.VoIP import CallState, InvalidStateError, PhoneStatus, VoIPPhone
    except ImportError as exc:
        raise SilviaConfigError(
            "pyVoIP ist nicht installiert. 'pip install --no-index "
            "--find-links C:\\silvia-offline\\wheels pyVoIP audioop-lts'."
        ) from exc

    voice_cfg = VoiceConfig.from_env()
    api_url = os.environ.get("SILVIA_API_URL") or None
    api_token = os.environ.get("SILVIA_PHONE_TOKEN") or None

    def on_call(call) -> None:
        call_id = f"sip-{uuid.uuid4().hex[:12]}"
        caller_from = str(getattr(call, "request_number", "") or "") or None
        engine = ConversationEngine(
            voice_cfg=voice_cfg,
            api_url=api_url,
            api_token=api_token,
            call_id=call_id,
            caller_from=caller_from,
        )
        ended_notified = False
        call_started = time.monotonic()
        last_speech = time.monotonic()
        phone_buf = bytearray()
        try:
            call.answer()
            _greeting_text, greeting_audio = engine.greeting()
            call.write_audio(pipeline_to_phone(greeting_audio))

            while True:
                # blocking=False liefert immer READ_CHUNK_BYTES Byte (Stille wird
                # mit 0x80 aufgefuellt) -> nie leer, daher Pacing ueber sleep.
                chunk = call.read_audio(length=READ_CHUNK_BYTES, blocking=False)
                phone_buf.extend(chunk)
                time.sleep(READ_PACE_S)

                # Gegenseite hat aufgelegt -> sauber beenden.
                if getattr(call, "state", None) == CallState.ENDED:
                    logger.info("Anruf %s: Gegenseite hat aufgelegt.", call_id)
                    break

                if len(phone_buf) < PROCESS_WINDOW_BYTES:
                    continue

                pcm = phone_to_pipeline(bytes(phone_buf))
                phone_buf.clear()
                for seg in split_segments(pcm):
                    _transcript, _reply_text, reply_audio = engine.handle_segment(seg.audio)
                    call.write_audio(pipeline_to_phone(reply_audio))
                    last_speech = time.monotonic()
                if engine.ended:
                    logger.info("Anruf %s: Silvia beendet das Gespraech.", call_id)
                    break
                if time.monotonic() - last_speech > END_SILENCE_S:
                    logger.info("Anruf %s: Ende durch Stille.", call_id)
                    break
                if time.monotonic() - call_started > HARD_CALL_TIMEOUT_S:
                    logger.warning("Anruf %s: hartes Zeitlimit erreicht, lege auf.", call_id)
                    break
        except Exception as exc:  # noqa: BLE001 - ein Anruf darf den Gateway nie stoppen
            # Nur die Exception-Klasse loggen, nie Transkript/Anrufer (PII).
            logger.warning("Fehler im Anruf %s: %s", call_id, type(exc).__name__)
        finally:
            # AP 56: Silvia ueber das Gespraechsende informieren, BEVOR aufgelegt
            # wird - guard-Flag, damit ein erneuter finally-Durchlauf (z. B. bei
            # Retry-Pfaden) nicht doppelt meldet.
            if api_url and not ended_notified:
                ended_notified = True
                try:
                    notify_call_ended(engine.history, api_url, api_token, engine.call_id, engine.caller_from)
                except Exception as exc:  # noqa: BLE001 - doppelte Absicherung
                    logger.warning("notify_call_ended fehlgeschlagen: %s", type(exc).__name__)
            try:
                call.hangup()
            except Exception as exc:  # noqa: BLE001 - halb-offene Calls vermeiden
                logger.warning("hangup fehlgeschlagen: %s", type(exc).__name__)

    logger.info("SIP-Registrierung bei %s:%s (lokaler SIP-Port %s) ...", server, port, local_port)
    phone = VoIPPhone(server, port, user, password, callCallback=on_call, sipPort=local_port)
    try:
        phone.start()
    except (InvalidStateError, OSError) as exc:
        raise SilviaConfigError(f"SIP-Registrierung fehlgeschlagen: {exc}") from exc

    logger.info("Registriert. Warte auf Anrufe (Strg+C zum Beenden).")
    prev_status = None
    restart_backoff_s = 5.0
    try:
        while True:
            time.sleep(3)
            try:
                status = phone.get_status()
            except Exception as exc:  # noqa: BLE001 - Ueberwachung darf nicht sterben
                logger.warning("get_status fehlgeschlagen: %s", type(exc).__name__)
                continue
            if status != prev_status:
                logger.info("Registrierungsstatus: %s", getattr(status, "value", status))
                prev_status = status
            if status == PhoneStatus.FAILED:
                # pyVoIP re-registriert normalerweise selbst (default_expires=120,
                # Timer auf expires-5). Bei FAILED (z. B. Registrar dauerhaft weg)
                # mit Backoff neu registrieren - best effort, kein Crash.
                logger.warning("Registrierung FAILED - Neustart in %.0fs.", restart_backoff_s)
                time.sleep(restart_backoff_s)
                try:
                    phone.stop()
                    phone.start()
                    restart_backoff_s = min(restart_backoff_s * 2, 60.0)
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Registrierungs-Neustart fehlgeschlagen: %s", type(exc).__name__)
    except KeyboardInterrupt:
        pass
    finally:
        phone.stop()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--mock", metavar="ANRUF.WAV", help="Registrar-loser Pipeline-Test")
    parser.add_argument("--sip", action="store_true", help="SIP-Registrierung (nur mit explizitem Sicherheits-Opt-in)")
    args = parser.parse_args()

    if not args.mock and not args.sip:
        parser.print_help()
        return 2

    try:
        if args.mock:
            run_mock(args.mock)
        if args.sip:
            run_sip()
    except SilviaConfigError as exc:
        print(f"[Konfigurationsfehler] {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
