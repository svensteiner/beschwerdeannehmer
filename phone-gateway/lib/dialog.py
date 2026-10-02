"""Lokaler Fallback-Dialog, wenn keine SILVIA_BRAIN_URL konfiguriert ist.

Kein Ersatz fuer die echte Silvia-Logik (ask-alma.ts) - nur ein einfacher,
deterministischer Rezeptions-Dialog auf Deutsch, der die Pipeline
(VAD -> STT -> Antwort -> TTS) ohne laufendes C:\\silvia testbar macht.
Siehe README "Offene Frage: Silvia-API".
"""
from __future__ import annotations

import re

GREETING = (
    "Gruess Gott, hier ist die Ordination. Wie kann ich Ihnen helfen?"
)

_TIER_PATTERN = re.compile(r"\b(katze|kater|hund|huendin)\b", re.IGNORECASE)
_PHONE_PATTERN = re.compile(r"(\+?\d[\d\s/-]{6,}\d)")
_TERMIN_PATTERN = re.compile(r"\btermin\b", re.IGNORECASE)
_GOODBYE_PATTERN = re.compile(r"auf wiederh\u00f6ren|auf wiederhoeren|tsch\u00fcss|tschuess", re.IGNORECASE)


def _extract_pet_name(text: str, tier_wort: str) -> str | None:
    # sucht das Wort direkt nach "Katze"/"Hund" (grob, deterministisch genug fuer den Pflichttest)
    pattern = re.compile(rf"{tier_wort}\s+(?:namens\s+)?([A-Z\u00c4\u00d6\u00dc][\wäöüß-]*)", re.IGNORECASE)
    m = pattern.search(text)
    if m:
        return m.group(1)
    return None


def is_goodbye(text: str) -> bool:
    return bool(_GOODBYE_PATTERN.search(text))


def local_reply(user_text: str) -> str:
    """Sehr einfache regelbasierte Antwort - kein LLM, keine Diagnosen, keine Preise."""
    text = user_text.strip()
    if not text:
        return "Entschuldigung, ich habe das nicht verstanden. Koennen Sie das bitte wiederholen?"

    tier_match = _TIER_PATTERN.search(text)
    phone_match = _PHONE_PATTERN.search(text)
    wants_termin = bool(_TERMIN_PATTERN.search(text))

    if wants_termin and tier_match:
        tier_wort = tier_match.group(1)
        pet_name = _extract_pet_name(text, tier_wort)
        pet_part = f" fuer {tier_wort.capitalize()} {pet_name}" if pet_name else f" fuer Ihre {tier_wort}"
        phone_part = ""
        if phone_match:
            phone_part = f" Ich habe Ihre Nummer {phone_match.group(1).strip()} notiert."
        return (
            f"Gerne, ich notiere einen Terminwunsch{pet_part}."
            f"{phone_part} Wir rufen Sie zur Bestaetigung zurueck. "
            "Gibt es sonst noch etwas?"
        )

    if wants_termin:
        return (
            "Gerne, ich notiere Ihren Terminwunsch. Fuer welches Tier und "
            "unter welcher Rueckrufnummer duerfen wir Sie erreichen?"
        )

    return (
        "Ich habe das notiert und leite es an die Ordination weiter. "
        "Gibt es sonst noch etwas, das ich fuer Sie tun kann?"
    )
