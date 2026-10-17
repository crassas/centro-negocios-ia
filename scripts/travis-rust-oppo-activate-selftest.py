#!/usr/bin/env python3
"""Dry-run tests for surgical OPPO activation; no active service or secrets."""
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest

SOURCE = Path(__file__).with_name("travis-rust-oppo-activate.py")
SPEC = importlib.util.spec_from_file_location("travis_oppo_activate", SOURCE)
activation = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(activation)


class PatchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = activation.fetch_at(activation.BASE, "operit-agent/jarvis_local.py")
        cls.patch = activation.fetch_at(activation.PIN, "operit-agent/jarvis_local.py")

    def test_pinned_reconstruction_exact(self):
        updated, blocks, relaxed = activation.patch_source(self.base, self.patch, self.base)
        self.assertEqual(relaxed, 0)
        self.assertEqual(updated, self.patch)
        self.assertGreaterEqual(blocks, 3)

    def test_preserves_local_nonconflicting_customisation(self):
        source = self.base.replace(
            "#!/usr/bin/env python3\n",
            "#!/usr/bin/env python3\n# personal OPPO header (preserved)\n", 1)
        merged, blocks, relaxed = activation.patch_source(self.base, self.patch, source)
        self.assertIn("# personal OPPO header (preserved)\n", merged)
        self.assertIn("github_knowledge_search", merged)
        self.assertIn("TRAVIS_GITHUB.start", merged)
        self.assertGreaterEqual(blocks, 3)
        compile(merged, "merged-jarvis.py", "exec")

    def test_custom_local_startup_and_cleanup_keep_the_owner_changes(self):
        # The OPPO may have local startup hooks not reflected in GitHub/main.
        source = self.base.replace(
            '   try:ThreadingHTTPServer(("127.0.0.1",8770),Handler).serve_forever()\n',
            '   try:\n    # device-local Android watchdog, unchanged by Rust\n'
            '    ThreadingHTTPServer(("127.0.0.1",8770),Handler).serve_forever()\n',
            1)
        source = source.replace(
            '    TRAVIS_BRAIN.stop()\n',
            '    # device-local shutdown observer\n    TRAVIS_BRAIN.stop()\n',
            1)
        merged, blocks, relaxed = activation.patch_source(self.base, self.patch, source)
        self.assertGreaterEqual(relaxed, 1)
        self.assertIn("# device-local Android watchdog, unchanged by Rust", merged)
        self.assertIn("# device-local shutdown observer", merged)
        self.assertIn("TRAVIS_GITHUB.start(idle=", merged)
        self.assertIn("TRAVIS_GITHUB.stop()", merged)
        compile(merged, "merged-local-jarvis.py", "exec")

    def test_check_does_not_modify_active_files(self):
        from unittest.mock import patch
        from io import StringIO
        from contextlib import redirect_stdout
        with tempfile.TemporaryDirectory() as folder:
            home = Path(folder)
            stage = home / "staged"
            (stage / "rust/travis-memory/target/release").mkdir(parents=True)
            (stage / ".verified-commit").write_text(activation.PIN)
            library = stage / "rust/travis-memory/target/release/libtravis_memory.so"
            library.write_bytes(b"ELF" + bytes(1024))
            target = home / "jarvis_local.py"
            source = self.base.replace(
                '   try:ThreadingHTTPServer(("127.0.0.1",8770),Handler).serve_forever()\n',
                '   try:\n    # custom Android startup in live source\n'
                '    ThreadingHTTPServer(("127.0.0.1",8770),Handler).serve_forever()\n',
                1)
            target.write_text(source)
            with patch.object(activation, "STAGE", stage), \
                    patch.object(activation, "JARVIS", target), \
                    patch.object(activation, "COMPILED_LIB", library), \
                    patch.object(activation, "fetch_at", side_effect=[
                        self.base, self.patch]), redirect_stdout(StringIO()) as output:
                activation.check()
            self.assertIn("RUST_OPPO_PATCH_CHECK=PASS", output.getvalue())
            self.assertEqual(target.read_text(), source)
            self.assertEqual(sorted(p.name for p in home.iterdir()),
                             ["jarvis_local.py", "staged"])

    def test_scope_rejects_ambiguous_fake_startup_anchor(self):
        source = self.base.replace(
            '   TRAVIS_BRAIN.start()\n',
            '   # device-local startup uses a different flow\n'
            '   begin_cognitive_runtime()\n',
            1)
        # The original insertion target is absent: do not guess another hook.
        with self.assertRaises(activation.Abort):
            activation.patch_source(self.base, self.patch, source)

    def test_conflict_does_not_replace_unknown_local_code(self):
        source = self.base.replace(
            "import travis_library\n", "import travis_library_modified_by_owner\n", 1)
        self.assertNotEqual(source, self.base)
        with self.assertRaises(activation.Abort):
            activation.patch_source(self.base, self.patch, source)


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.previous = (activation.FILES, activation.MAINTENANCE)
        activation.FILES = [self.root / "current.py", self.root / "new.py"]
        activation.MAINTENANCE = self.root / "state/maintenance"
        activation.FILES[0].write_bytes(b"# custom local source\n")
        activation.FILES[0].chmod(0o640)

    def tearDown(self):
        activation.FILES, activation.MAINTENANCE = self.previous
        self.tmp.cleanup()

    def test_backup_restore_preserves_old_and_removes_new(self):
        manifest = activation.snapshot(self.root / "backups" / "one")
        self.assertEqual(len(manifest["files"]), 2)
        activation.atomic_write(activation.FILES[0], b"# changed\n", mode=0o600)
        activation.atomic_write(activation.FILES[1], b"# new module\n")
        activation.MAINTENANCE.parent.mkdir(parents=True)
        activation.MAINTENANCE.touch()
        saved = activation.restore(self.root / "backups" / "one")
        self.assertEqual(activation.FILES[0].read_bytes(), b"# custom local source\n")
        self.assertEqual(activation.FILES[0].stat().st_mode & 0o777, 0o640)
        self.assertFalse(activation.FILES[1].exists())
        self.assertTrue(activation.MAINTENANCE.exists(), "Maintenance must stay through reboot")
        self.assertFalse(saved["maintenanceExisted"])

    def test_corrupt_backup_refused(self):
        directory = self.root / "backups" / "two"
        activation.snapshot(directory)
        (directory / "00.orig").write_bytes(b"tampered")
        with self.assertRaises(activation.Abort):
            activation.restore(directory)


if __name__ == "__main__":
    unittest.main(verbosity=2)
