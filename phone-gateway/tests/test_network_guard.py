"""Tests fuer den LAN-Netzwerk-Guard (unverschluesseltes SIP nur zu privaten Zielen)."""
import socket
import unittest
from unittest.mock import patch

from lib.network_guard import is_private_lan_target


class NetworkGuardTests(unittest.TestCase):
    def test_private_ipv4_literals_are_allowed(self):
        for host in ("192.168.1.1", "10.0.0.1", "172.16.0.1", "127.0.0.1"):
            self.assertTrue(is_private_lan_target(host), host)

    def test_public_ipv4_literals_are_rejected(self):
        for host in ("8.8.8.8", "1.1.1.1", "93.184.216.34"):
            self.assertFalse(is_private_lan_target(host), host)

    def test_loopback_ipv6_and_ula(self):
        self.assertTrue(is_private_lan_target("::1"))
        self.assertTrue(is_private_lan_target("fc00::1"))
        self.assertTrue(is_private_lan_target("localhost"))

    def test_public_ipv6_is_rejected(self):
        self.assertFalse(is_private_lan_target("2606:4700:4700::1111"))

    def test_unresolvable_local_suffix_is_allowed(self):
        with patch.object(socket, "getaddrinfo", side_effect=socket.gaierror("no dns")):
            self.assertTrue(is_private_lan_target("fritz.box"))
            self.assertTrue(is_private_lan_target("host.local"))
            self.assertTrue(is_private_lan_target("praxis.lan"))

    def test_unresolvable_nonlocal_name_is_rejected(self):
        with patch.object(socket, "getaddrinfo", side_effect=socket.gaierror("no dns")):
            self.assertFalse(is_private_lan_target("example.com"))

    def test_local_suffix_does_not_override_public_resolution(self):
        # Ein lokales Suffix darf eine oeffentliche Aufloesung NICHT ueberstimmen.
        with patch.object(
            socket,
            "getaddrinfo",
            return_value=[(socket.AF_INET, socket.SOCK_DGRAM, 17, "", ("8.8.8.8", 0))],
        ):
            self.assertFalse(is_private_lan_target("evil.local"))

    def test_mixed_private_public_is_rejected(self):
        with patch.object(
            socket,
            "getaddrinfo",
            return_value=[
                (socket.AF_INET, socket.SOCK_DGRAM, 17, "", ("192.168.1.1", 0)),
                (socket.AF_INET, socket.SOCK_DGRAM, 17, "", ("8.8.8.8", 0)),
            ],
        ):
            self.assertFalse(is_private_lan_target("dual.home.arpa"))

    def test_empty_input_is_rejected(self):
        self.assertFalse(is_private_lan_target(""))
        self.assertFalse(is_private_lan_target(None))


if __name__ == "__main__":
    unittest.main()
