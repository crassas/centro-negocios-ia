"""Optional, bounded Rust graph adapter. Python stays authoritative on failure."""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess



def configured_binary():
    """Explicit environment setting wins; a local marker enables the installed binary."""
    if "TRAVIS_RUST_BIN" in os.environ:
        return os.environ["TRAVIS_RUST_BIN"].strip()
    state = Path.home() / ".centro-jarvis"
    if (state / "rust-core-enabled").is_file():
        return str(state / "bin" / "travis-core")
    return ""


def graph_snapshot(db_path, limit=120):
    binary = configured_binary()
    if not binary or not Path(binary).is_file() or not os.access(binary, os.X_OK):
        return None
    limit = max(1, min(int(limit), 120))
    try:
        proc = subprocess.run(
            [binary, "graph", "--db", str(db_path), "--limit", str(limit)],
            capture_output=True, text=True, timeout=1.5, check=False,
        )
        if proc.returncode != 0 or len(proc.stdout) > 400_000:
            return None
        data = json.loads(proc.stdout)
    except (OSError, ValueError, UnicodeError, subprocess.TimeoutExpired):
        return None
    if not isinstance(data, dict) or data.get("ok") is not True:
        return None
    if (data.get("source") != "local-sqlite"
            or data.get("kind") != "persisted-memory-graph"
            or data.get("engine") != "rust"):
        return None
    nodes, links = data.get("nodes"), data.get("links")
    if not isinstance(nodes, list) or not isinstance(links, list):
        return None
    if len(nodes) > limit or len(links) > 320:
        return None
    ids = set()
    for node in nodes:
        if not isinstance(node, dict) or not isinstance(node.get("id"), str):
            return None
        if not isinstance(node.get("title"), str) or "summary" in node:
            return None
        ids.add(node["id"])
    if len(ids) != len(nodes):
        return None
    for link in links:
        if not isinstance(link, dict):
            return None
        if (link.get("source") not in ids or link.get("target") not in ids
                or link.get("provenance") != "persisted-synapse"):
            return None
    return data


def events_snapshot(db_path, limit=80):
    """Small, read-only event window from Rust; never export the private detail."""
    binary = configured_binary()
    if not binary or not Path(binary).is_file() or not os.access(binary, os.X_OK):
        return None
    limit = max(1, min(int(limit), 240))
    try:
        proc = subprocess.run(
            [binary, "events", "--db", str(db_path), "--limit", str(limit)],
            capture_output=True, text=True, timeout=1.5, check=False,
        )
        if proc.returncode != 0 or len(proc.stdout) > 110_000:
            return None
        data = json.loads(proc.stdout)
    except (OSError, ValueError, UnicodeError, subprocess.TimeoutExpired):
        return None
    if not isinstance(data, dict):
        return None
    if (data.get("ok") is not True or data.get("source") != "brain-sqlite"
            or data.get("engine") != "rust"
            or data.get("kind") != "observed-cognitive-events"):
        return None
    events = data.get("events")
    if not isinstance(events, list) or len(events) > limit:
        return None
    valid_regions = {"attention", "memory", "executive", "action", "monitor",
                     "regulation", "reflection"}
    seen = set()
    for event in events:
        if not isinstance(event, dict) or "detail" in event:
            return None
        event_id = event.get("id")
        if type(event_id) is not int or event_id < 0 or event_id in seen:
            return None
        seen.add(event_id)
        if event.get("region") not in valid_regions:
            return None
        if not isinstance(event.get("phase"), str) or len(event["phase"]) > 60:
            return None
        observed = event.get("created")
        if (observed is not None and
                (not isinstance(observed, (int, float)) or isinstance(observed, bool))):
            return None
    return data
