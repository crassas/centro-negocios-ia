"""Optional, bounded Rust graph adapter. Python stays authoritative on failure."""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess


def graph_snapshot(db_path, limit=120):
    binary = os.environ.get("TRAVIS_RUST_BIN", "").strip()
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
