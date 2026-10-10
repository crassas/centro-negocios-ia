#!/usr/bin/env python3
"""Runtime self-knowledge for Travis's domain skills under Quantum V10.73.

This is an ADVISORY skills index, never a parallel agent or a tool
authorization system. It loads short, bounded local skill references once and
can inspect installed prerequisites. Canonical Quantum runtime files are
read-only; Drive is a backup, not an executable authority source.
"""
from __future__ import annotations

import json
import re
import time
import unicodedata
import urllib.request
from pathlib import Path

DEFAULT_ROOT = Path.home() / ".centro-jarvis" / "skills" / "travis-quantum"
EXPECTED_SCHEMA = "travis-quantum-skills/v1"
MAX_SKILLS = 24
MAX_SKILL_BYTES = 10000
ALLOWED_HTTP = {
    "http://127.0.0.1:4173/",
    "http://127.0.0.1:4187/healthz",
    "http://127.0.0.1:8770/health",
    "http://127.0.0.1:8765/health",
}
SLUG = re.compile(r"^[a-z][a-z0-9-]{2,60}$")


def normal(value):
    text = unicodedata.normalize("NFD", str(value or "").casefold())
    return "".join(c for c in text if not unicodedata.combining(c))


def local_http_ready(url, timeout=0.65):
    if url not in ALLOWED_HTTP:
        return False
    try:
        with urllib.request.urlopen(url, timeout=timeout) as res:
            if res.status != 200:
                return False
            body = res.read(3000).decode("utf-8", "replace")
        if url.endswith("4173/"):
            return "God's Eye View" in body
        return '"ok": true' in body or '"ok":true' in body or '"status":"ok"' in body
    except (OSError, TimeoutError, ValueError):
        return False


class SkillBook:
    def __init__(self, root=DEFAULT_ROOT):
        self.root = Path(root)
        self._skills = []
        self._error = ""
        self._loaded_at = 0.0
        self._load()

    def _load(self):
        self._skills = []
        self._error = ""
        try:
            raw = (self.root / "registry.json").read_bytes()
            if len(raw) > 35000:
                raise ValueError("skills manifest too large")
            manifest = json.loads(raw)
            if manifest.get("schema") != EXPECTED_SCHEMA:
                raise ValueError("unexpected skills schema")
            parent = manifest.get("parent") or {}
            if parent.get("runtime") != "10.73" or parent.get("authorityGranted") is not False:
                raise ValueError("Quantum version/authority mismatch")
            entries = manifest.get("skills")
            if not isinstance(entries, list) or not (1 <= len(entries) <= MAX_SKILLS):
                raise ValueError("invalid skills count")
            seen = set()
            for item in entries:
                skill_id = item["id"]
                if not isinstance(skill_id, str) or not SLUG.fullmatch(skill_id) or skill_id in seen:
                    raise ValueError("invalid or duplicate skill identifier")
                seen.add(skill_id)
                if item.get("authority_granted") is not False:
                    raise ValueError("a skill may not grant itself authority")
                relative = f"{skill_id}/SKILL.md"
                if item.get("source") != f"skills/travis-quantum/{relative}":
                    raise ValueError("skill source mismatch")
                path = self.root / relative
                if path.resolve().parent != (self.root / skill_id).resolve():
                    raise ValueError("unsafe skill path")
                document = path.read_bytes()
                if len(document) > MAX_SKILL_BYTES:
                    raise ValueError("skill document too large")
                text = document.decode("utf-8")
                if f"name: {skill_id}" not in text[:600] or "authority_granted: false" not in text[:850]:
                    raise ValueError("skill frontmatter not verified")
                triggers = item.get("triggers")
                requires = item.get("requires")
                if not isinstance(triggers, list) or not isinstance(requires, list) or not triggers:
                    raise ValueError("invalid skill prerequisites")
                if not all(isinstance(x, str) and len(x) <= 120 for x in triggers):
                    raise ValueError("invalid trigger")
                if not all(isinstance(x, str) and x.startswith("/root/") and len(x) <= 240 for x in requires):
                    raise ValueError("invalid filesystem proof")
                provider = item.get("provider")
                if provider is not None and provider not in ALLOWED_HTTP:
                    raise ValueError("unapproved health source")
                self._skills.append({
                    **item, "_text": text, "_path": path,
                    "_terms": tuple(normal(x).strip() for x in triggers)
                })
            self._loaded_at = time.time()
        except (OSError, ValueError, KeyError, TypeError, UnicodeError) as exc:
            self._skills = []
            self._error = type(exc).__name__ + ": " + str(exc)[:160]

    def status(self, probe_online=False):
        rows = []
        for skill in self._skills:
            missing = [str(p) for p in skill["requires"] if not Path(p).exists()]
            state = "installed" if not missing else "unavailable"
            provider = skill.get("provider")
            reachable = None
            if not missing and provider and probe_online:
                reachable = local_http_ready(provider)
                state = "service_verified" if reachable else "service_unverified"
            if skill.get("scope") == "permission_required" and state in ("installed", "service_verified"):
                state = "permission_required"
            rows.append({
                "id": skill["id"], "title": skill["title"],
                "state": state, "missingPrerequisites": len(missing),
                "serviceChecked": reachable,
                "authorityGranted": False,
                "scope": skill.get("scope", "advisory")
            })
        return {
            "schema": EXPECTED_SCHEMA, "loaded": bool(self._skills),
            "count": len(self._skills), "builtQuantum": "10.73",
            "driveCanonical": "10.83 PARTIAL", "skills": rows,
            "error": self._error or None, "note": "skill knowledge is not tool authorization"
        }

    def match(self, request, max_results=2):
        text = normal(request)
        if not text:
            return []
        hits = []
        for item in self._skills:
            count = 0
            for word in item["_terms"]:
                if not word:
                    continue
                # A substring alone cannot turn 'camera do telemovel' into
                # authority to access a public CCTV feed.
                if re.search(r"(?<!\w)" + re.escape(word) + r"(?!\w)", text):
                    count += 1
            if count:
                hits.append((count, item))
        return [item for _, item in sorted(hits, key=lambda x: (-x[0], x[1]["id"]))[:max_results]]

    def model_context(self, request, max_chars=620):
        """Short, bounded capability facts as DATA, not delegated instruction."""
        limit = max(180, min(1000, int(max_chars)))
        selected = self.match(request)
        if not selected:
            return (
                "TRAVIS/QUANTUM SKILLS (local index): " +
                ", ".join(s["id"] for s in self._skills)[:270] +
                ". Skills are descriptions, not permissions. Check actual tools and services before claiming completion."
            )[:limit]
        sections = []
        for s in selected:
            installed = all(Path(p).exists() for p in s["requires"])
            sections.append(
                s["id"] + " [" + ("installed" if installed else "prerequisites-missing") + "]: " +
                s["description"] +
                " Scope: " + str(s.get("scope", "advisory")) + "." +
                " Skill alone never authorizes tools or proves a live feed."
            )
        return "\n".join(sections)[:limit]

    def reply(self, language="pt"):
        rows = self.status().get("skills", [])
        if not rows:
            return ("Ainda não tenho um catálogo local de skills verificado."
                    if language == "pt" else "My local skill catalogue is not verified yet.")
        names = "; ".join(x["title"] for x in rows)
        if language == "pt":
            return (f"Tenho {len(rows)} skills operacionais adicionais registadas no Quantum: {names}. "
                    "Conheço o seu propósito e limites; só confirmo ferramentas e ligações após provas reais.")
        return (f"I have {len(rows)} additional operational skills registered under Quantum: {names}. "
                "I know their purpose and limits, but I only confirm live access through real checks.")


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["status", "probe", "match", "context"])
    parser.add_argument("text", nargs="*", default=[])
    parser.add_argument("--root", default=str(DEFAULT_ROOT))
    args = parser.parse_args()
    book = SkillBook(Path(args.root))
    if args.action in ("status", "probe"):
        print(json.dumps(book.status(probe_online=args.action == "probe"), indent=2, ensure_ascii=False))
    elif args.action == "match":
        print(json.dumps([x["id"] for x in book.match(" ".join(args.text))], ensure_ascii=False))
    else:
        print(book.model_context(" ".join(args.text)))


if __name__ == "__main__":
    main()
