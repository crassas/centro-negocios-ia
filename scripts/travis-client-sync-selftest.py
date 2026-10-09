"""Exercise the installed-client updater without network or live files."""
import importlib.util
import io
import tempfile
from pathlib import Path
from unittest.mock import patch

repo = Path(__file__).resolve().parents[1]
ref = "1" * 40

with tempfile.TemporaryDirectory(prefix="travis-client-sync-") as temporary:
    task_root = Path(temporary)
    installed = task_root / ".centro-ui"
    installed.mkdir()
    spec = importlib.util.spec_from_file_location(
        "travis_station_test", repo / "operit-agent/centro_station.py"
    )
    station = importlib.util.module_from_spec(spec)
    with patch("pathlib.Path.home", return_value=task_root):
        spec.loader.exec_module(station)

    sources = {name: (repo / name).read_bytes() for name in station.TRAVIS_CLIENT_FILES}

    def download(request, timeout):
        assert timeout > 0
        prefix = f"{station.RAW_REPO_BASE}/{ref}/"
        assert request.full_url.startswith(prefix)
        return io.BytesIO(sources[request.full_url[len(prefix):]])

    with patch.object(station.urllib.request, "urlopen", side_effect=download):
        changed, errors = station.sync_travis_client(ref)
        assert not errors, errors
        assert changed == list(station.TRAVIS_CLIENT_FILES), changed
        assert all((installed / name).read_bytes() == data for name, data in sources.items())
        assert station.sync_travis_client(ref) == ([], []), "Unchanged clients must be preserved"

        # A broken shared shader must reject the complete update before any write.
        before = {name: (installed / name).read_bytes() for name in sources}
        sources["travis-holographic-head.mjs"] = sources["travis-holographic-head.mjs"].replace(
            b"gl_PointSize=clamp((.72+aSeed*.55)", b"gl_PointSize=clamp((1.0+aSeed*2.3)"
        )
        sources["index.html"] += b"\n<!-- staged but invalid client -->\n"
        changed, errors = station.sync_travis_client(ref)
        assert not changed and len(errors) == 1, (changed, errors)
        assert "travis-holographic-head.mjs: visible GPU point size regression" in errors[0]
        assert all((installed / name).read_bytes() == data for name, data in before.items())

        changed, errors = station.sync_travis_client("invalid")
        assert not changed and errors

print("PASS CLIENT_SYNC: current bundle accepted, repeat is inert, broken shader preserves installed files")
