"""Netzwerk-Guard: unverschluesseltes SIP/RTP nur zu privaten LAN-Zielen.

pyVoIP kann in diesem Gateway kein TLS/SRTP (siehe README "Sicherheitsstopp").
Deshalb darf unverschluesseltes SIP/RTP ausschliesslich zu einem Registrar im
eigenen LAN gehen (FritzBox vor Ort), nie zu einer oeffentlichen IP. Diese
Pruefung ergaenzt das menschliche Opt-in SILVIA_PHONE_ALLOW_UNENCRYPTED_LAN=1
um eine maschinelle, technische Grenze: Selbst wenn jemand das Opt-in setzt,
wird ein oeffentlicher Registrar hart abgelehnt.

Gegenstueck auf der Silvia-Seite: isLocalOrLanIp in
C:\\silvia\\src\\lib\\practice\\phone-auth.ts.
"""
from __future__ import annotations

import ipaddress
import socket

# Bekannte lokale DNS-Suffixe. Wird ein Name NICHT aufgeloest (getaddrinfo
# schlaegt fehl), gilt er nur dann als LAN, wenn er eines dieser Suffixe
# traegt (z. B. "fritz.box" ohne eigenen DNS-Server). Loest der Name aber
# AUF eine oeffentliche IP auf, gewinnt die IP-Pruefung (Defense-in-depth) -
# ein lokales Suffix ueberstimmt niemals eine oeffentliche Aufloesung.
LOCAL_SUFFIXES = (
    ".fritz.box",
    ".local",
    ".lan",
    ".internal",
    ".home",
    ".home.arpa",
)

# Namen, die selbst (nicht nur als Suffix) ein lokales Ziel bezeichnen.
# "fritz.box" ist der eigene mDNS/DNS-Name der FritzBox (Subdomains wie
# "nas.fritz.box" deckt bereits LOCAL_SUFFIXES ab).
LOCAL_EXACT_HOSTS = ("fritz.box",)


def _is_local_name(host: str) -> bool:
    return host in LOCAL_EXACT_HOSTS or host.endswith(LOCAL_SUFFIXES)


def _is_private_ip(ip_str: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip_str)
    except ValueError:
        return False
    # Nicht oeffentlich routbar. is_private deckt RFC1918, Loopback, Link-local
    # und ULA (fc00::/7) ab; die zusaetzlichen Predikate dokumentieren Absicht.
    return (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_unspecified
    )


def is_private_lan_target(host: str) -> bool:
    """True, wenn ALLE aufgeloesten Adressen von `host` privat/LAN sind.

    Ein nicht-aufloesbarer Name gilt nur mit lokalem Suffix als LAN
    (z. B. "fritz.box"). Jede oeffentliche IP fuehrt zu False (fail-closed).
    """
    if not host or not isinstance(host, str):
        return False
    host = host.strip().rstrip(".").lower()
    if not host:
        return False
    if host == "localhost":
        return True

    try:
        infos = socket.getaddrinfo(host, None, type=socket.SOCK_DGRAM)
    except (socket.gaierror, OSError):
        return _is_local_name(host)

    resolved = [info[4][0] for info in infos if info[4]]
    if not resolved:
        return _is_local_name(host)
    return all(_is_private_ip(ip) for ip in resolved)
