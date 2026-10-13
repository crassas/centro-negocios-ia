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
        updated, blocks = activation.patch_source(self.base, self.patch, self.base)
        self.assertEqual(updated, self.patch)
        self.assertGreaterEqual(blocks, 3)

    def test_preserves_local_nonconflicting_customisation(self):
        source = self.base.replace(
            "#!/usr/bin/env python3\n",
            "#!/usr/bin/env python3\n# personal OPPO header (preserved)\n", 1)
        merged, blocks = activation.patch_source(self.base, self.patch, source)
        self.assertIn("# personal OPPO header (preserved)\n", merged)
        self.assertIn("github_knowledge_search", merged)
        self.assertIn("TRAVIS_GITHUB.start", merged)
        self.assertGreaterEqual(blocks, 3)
        compile(merged, "merged-jarvis.py", "exec")

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
