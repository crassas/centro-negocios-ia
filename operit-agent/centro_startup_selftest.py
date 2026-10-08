"""Startup regression checks without binding ports or touching a live service."""
import errno
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

_home = tempfile.TemporaryDirectory(prefix="centro-startup-import-")
with patch.object(Path, "home", return_value=Path(_home.name)):
    import centro_server as server


class StartupTests(unittest.TestCase):
    def test_duplicate_does_not_clear_live_task_or_write_pid(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "server.pid").write_text("4321")
            with patch.object(server, "STATE_DIR", root), patch.object(server, "ThreadingHTTPServer", side_effect=OSError(errno.EADDRINUSE, "busy")), patch.object(server, "existing_server_pid", return_value=4321), patch.object(server, "clear_busy") as clear:
                self.assertEqual(server.main(), 0)
                clear.assert_not_called()
                self.assertEqual((root / "server.pid").read_text(), "4321")

    def test_unknown_port_owner_is_not_claimed_or_stopped(self):
        with patch.object(server, "ThreadingHTTPServer", side_effect=OSError(errno.EADDRINUSE, "busy")), patch.object(server, "existing_server_pid", return_value=None), patch.object(server, "clear_busy") as clear, patch.object(server.os, "kill") as kill:
            self.assertEqual(server.main(), 1)
            clear.assert_not_called()
            kill.assert_not_called()

    def test_only_owner_clears_stale_task_and_cleans_own_pid(self):
        with tempfile.TemporaryDirectory() as tmp:
            events = []
            httpd = Mock()
            httpd.serve_forever.side_effect = KeyboardInterrupt
            def bind(*args):
                events.append("bound")
                return httpd
            with patch.object(server, "STATE_DIR", Path(tmp)), patch.object(server, "ThreadingHTTPServer", side_effect=bind), patch.object(server, "clear_busy", side_effect=lambda: events.append("cleared")), patch.object(server.signal, "signal"):
                server.main()
            self.assertEqual(events, ["bound", "cleared"])
            httpd.server_close.assert_called_once()
            self.assertFalse((Path(tmp) / "server.pid").exists())

    def test_adoption_requires_authenticated_status_and_matching_process(self):
        data = {"ok": True, "server": {"host": server.HOST, "port": server.PORT, "private": True, "pid": 4321}}
        command = b"python3\0" + str(Path(server.__file__).resolve()).encode() + b"\0"
        with patch.object(server.urllib.request, "urlopen", side_effect=lambda *a, **kw: io.BytesIO(json.dumps(data).encode())), patch.object(Path, "read_bytes", return_value=command), patch.object(server.os, "kill") as kill:
            self.assertEqual(server.existing_server_pid(), 4321)
            kill.assert_called_once_with(4321, 0)
        with patch.object(server.urllib.request, "urlopen", side_effect=lambda *a, **kw: io.BytesIO(json.dumps(data).encode())), patch.object(Path, "read_bytes", return_value=b"python3\0unrelated.py\0"), patch.object(server.os, "kill") as kill:
            self.assertIsNone(server.existing_server_pid())
            kill.assert_not_called()


if __name__ == "__main__":
    unittest.main(verbosity=2)
