#!/usr/bin/env python3
"""Speech-only condensation for verbose sourced lookup answers.

The displayed answer, citations and persistent record are NEVER modified.
This is a presentation transform, not a summary by a language model.
Only the very specific 'Encontrei N passagens ... Fonte: URL' pattern is
shortened; other messages (including permissions and safety notices) remain
verbatim. The output never gains unsupported factual claims.
"""
from __future__ import annotations
import re

LIBRARY_OPEN = re.compile(
    r"^\s*Encontrei\s+([0-9]{1,3})\s+passagens\s+com\s+fontes:\s*",
    re.I,
)
SOURCED_ITEM = re.compile(r"\s+Fonte:\s*https?://[^\s]+",re.I)
TRAILING_END = re.compile(r"[.!?](?=\s|$)")

def spoken_reply(reply,language="pt"):
    """Return only the audio script; don't change the visible source answer.

    Controlled exception: read aloud just the first existing sourced result,
    and explicitly announce that other items are only displayed.
    """
    original=str(reply or "")
    opening=LIBRARY_OPEN.match(original)
    if not opening or not SOURCED_ITEM.search(original):
        return original
    first=SOURCED_ITEM.split(original,1)[0][opening.end():].strip()
    if not first:
        return original
    first=re.sub(r";\s*(nota interpretativa|texto original)\s*\.\s*", ". ", first,
                 flags=re.I)
    first=re.sub(r"\s+"," ",first).strip()
    # Keep one complete thought; never cut inside a word or invent a sentence.
    if len(first)>390:
        stops=[m.end() for m in TRAILING_END.finditer(first) if 160<=m.end()<=390]
        if not stops:
            return original
        first=first[:stops[-1]].rstrip()
    n=opening.group(1)
    if language=="en":
        # The source entry may still be in PT; never pretend it was translated.
        lead=f"Encontrei {n} passagens. "
        tail=" As restantes passagens e as fontes estão no ecrã."
    else:
        lead=f"Encontrei {n} passagens. "
        tail=" As restantes passagens e as fontes estão no ecrã."
    result=lead+first.rstrip(" .")+"."+tail
    return result if len(result)<len(original) else original
