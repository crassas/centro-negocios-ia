"""Camera watchdog recovery must never affect an unrelated process."""
import importlib.util
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

repo = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("station", repo / "operit-agent/centro_station.py")
station = importlib.util.module_from_spec(spec)
spec.loader.exec_module(station)
with tempfile.TemporaryDirectory() as folder, patch.object(station, "HOME", Path(folder)):
    root = Path(folder) / ".centro-extensions"
    root.mkdir()
    runner = root / "travis-world-watch.py"
    with patch.object(station.subprocess, "Popen", return_value=SimpleNamespace(pid=54321)) as spawn:
        assert not station.ensure_travis_world_watch(100)
        spawn.assert_not_called()  # No optional extension: nothing is installed or started.
        runner.write_text("# installed extension\n")
        with patch.object(station, "pid_running", return_value=(False, None)):
            station.ensure_travis_world_watch(100)
            assert spawn.call_count == 1
            station.ensure_travis_world_watch(110)
            assert spawn.call_count == 1  # Backoff after failed startup.
        with patch.object(station, "pid_running", return_value=(True, 123)), \
                patch.object(station, "proc_cmdline", return_value=f"python3 {runner}"):
            assert station.ensure_travis_world_watch(150)
            assert spawn.call_count == 1
        with patch.object(station, "pid_running", return_value=(True, 123)), \
                patch.object(station, "proc_cmdline", return_value="python3 /unrelated/service.py"):
            station.ensure_travis_world_watch(151)
            assert spawn.call_count == 2  # Stale/reused PID cannot suppress recovery.
        (root / "travis-world.disabled").touch()
        station.ensure_travis_world_watch(300)
        assert spawn.call_count == 2
        (root / "travis-world.disabled").unlink()
        with patch.dict(station.os.environ, {"CENTRO_TRAVIS_WORLD_AUTOSTART": "0"}):
            station.ensure_travis_world_watch(400)
            assert spawn.call_count == 2
        assert spawn.call_args.args[0] == [station.sys.executable, str(runner)]
        assert spawn.call_args.kwargs["start_new_session"] is True
print("PASS camera supervisor: absent/disabled preserved, live owner retained, outage recovered, retry bounded")
