#!/usr/bin/env python3
"""Optional local ctypes bridge to the Rust memory scorer. Disabled by default."""
from __future__ import annotations

import ctypes
import functools
import json
import os
from pathlib import Path
import sys

MAX_ROWS = 500
MAX_JSON_BYTES = 2 * 1024 * 1024

class RustMemoryUnavailable(RuntimeError):
    """The native kernel is unavailable or refused the batch."""

def library_path() -> Path:
    override = os.environ.get("TRAVIS_RUST_MEMORY_LIB", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    filename = ("libtravis_memory.dylib" if sys.platform == "darwin" else
                "travis_memory.dll" if sys.platform == "win32" else "libtravis_memory.so")
    home = Path.home()
    # Station installs this module directly in $HOME. The library cannot be
    # assumed to live beside its original repository source after installation.
    candidates = (
        home / ".centro-jarvis" / "bin" / filename,
        Path(__file__).resolve().parent.parent / "rust" / "travis-memory" / "target" / "release" / filename,
        home / "repos" / "centro-negocios-ia" / "rust" / "travis-memory" / "target" / "release" / filename,
    )
    return next((p for p in candidates if p.is_file()), candidates[0])

@functools.lru_cache(maxsize=4)
def _native(path: str):
    try:
        library = ctypes.CDLL(path)
    except OSError as exc:
        raise RustMemoryUnavailable(f"Biblioteca Rust indisponível: {exc}") from exc
    try:
        score = library.travis_memory_overlap_batch
        score.argtypes = [ctypes.c_void_p, ctypes.c_size_t,
                          ctypes.POINTER(ctypes.c_double), ctypes.c_size_t]
        score.restype = ctypes.c_int
    except AttributeError as exc:
        raise RustMemoryUnavailable("ABI Rust incompatível") from exc
    return score

def score_overlaps(query: str, rows: list[dict[str, str]]) -> list[float]:
    """Return exact lexical overlaps, without touching SQLite or Python recall."""
    if not isinstance(query, str) or not isinstance(rows, list) or len(rows) > MAX_ROWS:
        raise ValueError("Lote de memória inválido")
    if not rows:
        return []
    data = json.dumps({"query": query, "rows": rows}, ensure_ascii=False,
                      separators=(",", ":")).encode("utf-8")
    if len(data) > MAX_JSON_BYTES:
        raise ValueError("Lote de memória excede o limite")
    input_buffer = ctypes.create_string_buffer(data)
    output = (ctypes.c_double * len(rows))()
    count = _native(str(library_path()))(input_buffer, len(data), output, len(rows))
    if count != len(rows):
        raise RustMemoryUnavailable(f"Kernel Rust recusou o lote ({count})")
    return list(output)
