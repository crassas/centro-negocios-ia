#!/usr/bin/env python3
"""whisper.cpp Python binding; input/output paths are ephemeral local files."""
import sys
from pathlib import Path
from pywhispercpp.model import Model
model=Model(sys.argv[1],n_threads=2,print_realtime=False,print_progress=False)
segments=model.transcribe(sys.argv[2],language="pt")
Path(sys.argv[3]).write_text(" ".join(segment.text.strip() for segment in segments),encoding="utf-8")
