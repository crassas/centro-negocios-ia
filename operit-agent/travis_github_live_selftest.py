#!/usr/bin/env python3
"""Live public-GitHub RAG smoke; ephemeral SQLite, no private data or code execution."""
import json
import tempfile
from pathlib import Path
from travis_github_feed import Feed

with tempfile.TemporaryDirectory(prefix="travis-github-public-") as directory:
    feed = Feed(Path(directory) / "github.sqlite")
    for source in ("rust-book", "pilot"):
        first = feed.sync(source)
        assert first["result"] == "updated", first
        assert first["passages"] > 0, first
        assert feed.sync(source)["result"] == "unchanged"
    result = feed.recall("Rust ownership memória", limit=4, use_rust=True)
    assert result["results"], "No public references returned"
    assert all(x["url"].startswith("https://github.com/") for x in result["results"])
    assert all("/blob/" + x["revision"] + "/" in x["url"] for x in result["results"])
    assert not result["trainedWeights"]
    print(json.dumps({
        "result": "LIVE_PUBLIC_GITHUB_REFERENCE_PASS",
        "sources": [v["source"] for v in feed.status()["sources"]],
        "retrievalEngine": result["engine"],
        "references": [v["url"] for v in result["results"][:2]],
        "privateDataSent": False,
        "executedGithubCode": False,
    }))
