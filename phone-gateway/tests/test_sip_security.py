import os
import unittest
from unittest.mock import patch

import phone_gateway
from lib.silvia_client import SilviaConfigError


class SipSecurityTests(unittest.TestCase):
    def test_plain_sip_requires_explicit_acknowledgement(self):
        env = {
            "SIP_SERVER": "127.0.0.1",
            "SIP_USER": "synthetic-user",
            "SIP_PASS": "synthetic-password",
            "SIP_PORT": "5060",
            "SILVIA_PHONE_ALLOW_UNENCRYPTED_LAN": "0",
        }
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaisesRegex(SilviaConfigError, "Unverschluesseltes SIP/RTP"):
                phone_gateway.run_sip()

    def test_plain_sip_acknowledgement_is_exact(self):
        self.assertFalse(phone_gateway.plain_sip_acknowledged({}))
        self.assertFalse(phone_gateway.plain_sip_acknowledged({"SILVIA_PHONE_ALLOW_UNENCRYPTED_LAN": "yes"}))
        self.assertTrue(phone_gateway.plain_sip_acknowledged({"SILVIA_PHONE_ALLOW_UNENCRYPTED_LAN": "1"}))

    def test_public_registrar_is_rejected_even_with_opt_in(self):
        env = {
            "SIP_SERVER": "8.8.8.8",
            "SIP_USER": "synthetic-user",
            "SIP_PASS": "synthetic-password",
            "SIP_PORT": "5060",
            "SILVIA_PHONE_ALLOW_UNENCRYPTED_LAN": "1",
        }
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaisesRegex(SilviaConfigError, "oeffentliche IP"):
                phone_gateway.run_sip()

    def test_invalid_sip_port_is_a_config_error(self):
        env = {
            "SIP_SERVER": "127.0.0.1",
            "SIP_USER": "synthetic-user",
            "SIP_PASS": "synthetic-password",
            "SIP_PORT": "nicht-eine-zahl",
            "SILVIA_PHONE_ALLOW_UNENCRYPTED_LAN": "1",
        }
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaisesRegex(SilviaConfigError, "SIP_PORT muss eine ganze Zahl"):
                phone_gateway.run_sip()

    def test_parse_sip_port_range(self):
        self.assertEqual(phone_gateway._parse_sip_port("SIP_PORT", "5060"), 5060)
        with patch.dict(os.environ, {"SIP_PORT": "70000"}, clear=True):
            with self.assertRaises(SilviaConfigError):
                phone_gateway._parse_sip_port("SIP_PORT")


if __name__ == "__main__":
    unittest.main()
