"""Prueft, ob STT/TTS erreichbar sind, und ob SIP-Zugangsdaten gesetzt sind.

Aufruf: python healthcheck.py
Exit-Code 0 nur, wenn STT und TTS erreichbar sind (SIP ist optional/fehlt
laut Betreiber-Entscheidung meist noch).
"""
from __future__ import annotations

import os
import sys

import requests

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass


def check_http(name: str, url: str) -> bool:
    try:
        resp = requests.get(url, timeout=3)
        ok = resp.status_code < 500
    except requests.RequestException as exc:
        print(f"[FEHLER] {name} ({url}): nicht erreichbar - {exc}")
        return False
    print(f"[OK] {name} ({url}): HTTP {resp.status_code}")
    return ok


def main() -> int:
    stt_url = os.environ.get("STT_URL", "http://127.0.0.1:8178")
    tts_url = os.environ.get("TTS_URL", "http://127.0.0.1:8179")

    ok_stt = check_http("STT", stt_url + "/v1/audio/transcriptions")
    ok_tts = check_http("TTS", tts_url + "/v1/audio/speech")

    sip_server = os.environ.get("SIP_SERVER")
    if sip_server:
        from lib.network_guard import is_private_lan_target

        if not is_private_lan_target(sip_server):
            print(f"[GESPERRT] SIP_SERVER={sip_server} zeigt auf eine oeffentliche IP. "
                  "Unverschluesseltes SIP/RTP ist nur zu privaten LAN-Registraren zulaessig.")
        elif os.environ.get("SILVIA_PHONE_ALLOW_UNENCRYPTED_LAN", "").strip() == "1":
            print("[WARN] SIP-Testnetz-Opt-in gesetzt: pyVoIP nutzt unverschluesseltes SIP/RTP "
                  "nur zu einem privaten LAN-Ziel; keine Praxisfreigabe.")
        else:
            print("[GESPERRT] SIP_SERVER ist ein privates LAN-Ziel, aber unverschluesseltes "
                  "SIP/RTP bleibt ohne expliziten Testnetz-Opt-in gesperrt.")
    else:
        print("[INFO] SIP_SERVER nicht gesetzt - Telefonanlage laut Betreiber noch unbekannt. "
              "Mock-Modus (--mock) bleibt der Pflichttest.")

    brain_url = os.environ.get("SILVIA_BRAIN_URL")
    if brain_url:
        print(f"[INFO] SILVIA_BRAIN_URL gesetzt: {brain_url}")
    else:
        print("[INFO] SILVIA_BRAIN_URL nicht gesetzt - lokaler Fallback-Dialog wird genutzt.")

    # STT/TTS-Endpunkte antworten auf GET typischerweise mit 404/405 (nur POST
    # definiert) - das zaehlt hier als "erreichbar", nur Verbindungsfehler zaehlen als FEHLER.
    return 0 if (ok_stt and ok_tts) else 1


if __name__ == "__main__":
    raise SystemExit(main())
