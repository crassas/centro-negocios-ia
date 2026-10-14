#!/usr/bin/env python3
"""Offline regression tests for the staged Android ChatGPT voice handoff."""
import importlib.util
from pathlib import Path
import unittest

PATH = Path(__file__).with_name("travis-chatgpt-call-oppo.py")
SPEC = importlib.util.spec_from_file_location("chatgpt_handoff_installer", PATH)
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)

MOCK_PARSER = """import re
def fold(t):
    return t.lower().replace(",", "").strip()
def intent(text: str):
    s = fold(text)
    s = re.sub(r"^(?:travis|jarvis)[,;:\\s]+", "", s)
    if not 1 < len(s) <= 700:
        return None
    if s.startswith("paga"):return {"action": "payment_denied"}
    if s.startswith("abre o youtube"):return {"action": "open_app", "app": "youtube"}
    return None
"""
MOCK_BROKER = """class NativeBridge:
    @classmethod
    def allowed_command(cls, kind, args):return True
    def request(self, kind: str, visual: bool = False, seconds: float = 12, args: dict | None = None):
        args = args or {}
        if not self.allowed_command(kind, args):
            return {"ok": False, "reply": "Comando bloqueado"}
        return {"ok": True}
"""


def call_module():
    namespace = {"__name__": "travis_chatgpt_call"}
    exec(compile(module.CALL_MODULE, "travis_chatgpt_call.py", "exec"), namespace)
    return namespace["call_chatgpt_voice"]


class FakeBridge:
    def __init__(self, *, online=True, opened=True, correct_app=True, clicked=False):
        self.online = online
        self.opened = opened
        self.correct_app = correct_app
        self.clicked = clicked
        self.calls = []

    def status(self):
        return {"paired": True, "online": self.online, "clientVersion": 4}

    def request(self, kind, args=None, seconds=12):
        self.calls.append((kind, args))
        if kind == "open_app":
            return {"ok": self.opened, "verified": self.opened}
        if kind == "observe":
            return {"ok": True, "verified": True,
                    "app": "ChatGPT" if self.correct_app else "Chrome"}
        if kind == "tap_label":
            return {"ok": self.clicked, "accepted": self.clicked, "verified": False}
        raise AssertionError("Unexpected native action")


class Handoff(unittest.TestCase):
    def test_live_route_without_artemis_import_is_accepted(self):
        from unittest.mock import patch
        from contextlib import redirect_stdout
        from io import StringIO
        sample_jarvis = (
            "import travis_native_bridge\n"
            "def http_route(path):\n"
            '    if path.startswith("/native-bridge/"):\n'
            "        return travis_native_bridge.BRIDGE.status()\n"
        )
        self.assertNotIn("travis_artemis_bridge", sample_jarvis)
        artemis = "import travis_android_commands\nimport travis_native_bridge\n# open_app\n"
        def mocked_read(path):
            if path == module.JARVIS:
                return sample_jarvis
            if path == module.ARTEMIS:
                return artemis
            if path == module.INTENTS:
                return MOCK_PARSER
            if path == module.BROKER:
                return MOCK_BROKER
            raise AssertionError("Unexpected path")
        import tempfile
        with tempfile.TemporaryDirectory() as tmp, patch.object(module, "MARKER", Path(tmp) / "activated.json"), patch.object(module, "live", return_value={
                 "jarvisOnline": True, "jarvisBusy": False,
                 "bridgeHttp": 200, "bridgeOnline": True,
                 "bridgePaired": True, "clientVersion": 4,
             }), patch.object(module, "read", side_effect=mocked_read), \
                redirect_stdout(StringIO()) as buffer:
            stages = module.check()
        self.assertEqual(len(stages), 2)
        self.assertIn("TRAVIS_CHATGPT_CHECK", buffer.getvalue())

    def test_syntax_and_voice_alias(self):
        injected, bridge = module.staged(MOCK_PARSER, MOCK_BROKER)
        module.trial_parser(injected)
        compile(injected, "intents.py", "exec")
        compile(bridge, "broker.py", "exec")
        compile(module.CALL_MODULE, "chatgpt_call.py", "exec")
        self.assertIn(module.FLAG, injected)
        self.assertIn(module.FLAG, bridge)

    def test_second_application_is_not_installed(self):
        intents, bridge = module.staged(MOCK_PARSER, MOCK_BROKER)
        with self.assertRaises(module.Stop):
            module.staged(intents, bridge)

    def test_fails_closed_with_unknown_native_layout(self):
        with self.assertRaises(module.Stop):
            module.staged("some unrelated code", MOCK_BROKER)
        with self.assertRaises(module.Stop):
            module.staged(MOCK_PARSER, "unrelated server")

    def test_denies_control_when_offline(self):
        fake = FakeBridge(online=False)
        result = call_module()(fake)
        self.assertFalse(result["ok"])
        self.assertEqual(fake.calls, [])

    def test_no_touch_if_chatgpt_not_verified(self):
        fake = FakeBridge(correct_app=False)
        result = call_module()(fake)
        self.assertTrue(result["ok"])
        self.assertFalse(result["voiceLiveVerified"])
        self.assertEqual([k for k, _ in fake.calls], ["open_app", "observe"])

    def test_no_touch_on_failed_app_launch(self):
        fake = FakeBridge(opened=False)
        result = call_module()(fake)
        self.assertFalse(result["ok"])
        self.assertEqual([k for k, _ in fake.calls], ["open_app"])

    def test_voice_click_remains_unverified(self):
        fake = FakeBridge(clicked=True)
        result = call_module()(fake)
        self.assertTrue(result["ok"])
        self.assertTrue(result["voiceButtonPressed"])
        self.assertFalse(result["voiceLiveVerified"])
        self.assertEqual(fake.calls[:2], [
            ("open_app", {"app": "chatgpt"}), ("observe", None)])
        self.assertEqual(len([x for x in fake.calls if x[0] == "tap_label"]), 1)

    def test_no_unapproved_package_or_ui_action(self):
        fake = FakeBridge(clicked=False)
        result = call_module()(fake)
        self.assertTrue(result["ok"])
        self.assertFalse(result["voiceButtonPressed"])
        self.assertFalse(result["voiceLiveVerified"])
        kinds = {k for k, _ in fake.calls}
        self.assertEqual(kinds, {"open_app", "observe", "tap_label"})
        self.assertLessEqual(len(fake.calls), 6)
        self.assertTrue(all(args is None or (
            args.get("app") == "chatgpt" or
            args.get("target") in (
                "Iniciar conversa por voz", "Start voice conversation",
                "Start voice chat", "Iniciar modo de voz"))
            for _, args in fake.calls))


if __name__ == "__main__":
    unittest.main(verbosity=2)
