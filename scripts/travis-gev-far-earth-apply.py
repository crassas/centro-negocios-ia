#!/usr/bin/env python3
"""Apply/revert a narrowly scoped Android far-zoom Cesium black-globe fix.

Edits ONLY the separate, pinned local God's Eye View checkout. Does not
touch the Travis application, Centro Server/Agent or the remote supervisor.
Uses a copy of the EXISTING Travis Earth JPEG as a georeferenced, static
fallback WGS84 ellipsoid and preserves Esri/OSM for closer views.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

HOME = Path.home()
ROOT = HOME / "travis-gev-keyless"
SCENE = ROOT / "src" / "app" / "scene.js"
MODULE = ROOT / "src" / "app" / "travisFarEarth.js"
IMAGE = ROOT / "public" / "travis-earth-reference.jpg"
TRAVIS_IMAGE = HOME / ".centro-ui" / "assets" / "travis" / "earth" / "earth-day-2048.jpg"
PATCH_MODULE = HOME / ".centro-extensions" / "travis-gev-far-earth.mjs"
STATE = HOME / ".local" / "state" / "travis-gev" / "far-earth-fix"
BACKUP = STATE / "original-scene.js"
MANIFEST = STATE / "manifest.json"
PIN = "591f299d11f38a612629a274463196d57ae3862e"
IMPORT = "import { installTravisFarEarth } from './travisFarEarth.js';"
IMPORT_ANCHOR = "import { describeError } from './errors.js';"
CALL = "  defer(installTravisFarEarth(viewer, mapStackController));"
CALL_ANCHOR = """  await mapStackController.setStack(tileset ? 'photoreal' : 'esri-imagery', {
    silent: true,
  });"""


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def abort(message: str):
    raise RuntimeError("Travis GEV far Earth: " + message)


def git_check():
    if not (ROOT / ".git").is_dir():
        abort("God's Eye View checkout missing")
    origin = subprocess.check_output(
        ["git", "-C", str(ROOT), "remote", "get-url", "origin"],
        text=True,
    ).strip()
    if origin not in (
        "https://github.com/bilawalsidhu/gods-eye-view.git",
        "https://github.com/bilawalsidhu/gods-eye-view",
    ):
        abort("unrecognised upstream origin")
    commit = subprocess.check_output(
        ["git", "-C", str(ROOT), "rev-parse", "HEAD"], text=True
    ).strip()
    if commit != PIN:
        abort("unsupported upstream revision; no files modified")


def replace_once(content: str, original: str, updated: str, name: str) -> str:
    if content.count(original) != 1:
        abort("expected one " + name + " anchor")
    return content.replace(original, updated, 1)


def check_js(path: Path):
    subprocess.run(["node", "--check", str(path)], check=True, capture_output=True)


def write_atomic(path: Path, data: bytes):
    temp = path.with_name(path.name + ".travis-far-earth.tmp")
    temp.write_bytes(data)
    os.chmod(temp, path.stat().st_mode & 0o777)
    temp.replace(path)


def apply():
    git_check()
    if not all(p.is_file() for p in (SCENE, TRAVIS_IMAGE, PATCH_MODULE)):
        abort("a required application/source file is missing")
    if TRAVIS_IMAGE.stat().st_size < 100_000:
        abort("Earth reference texture is too small")
    original = SCENE.read_text(encoding="utf-8")
    if IMPORT in original and CALL in original:
        if not MODULE.is_file() or not IMAGE.is_file():
            abort("partly installed; inspect before retrying")
        check_js(SCENE)
        check_js(MODULE)
        print("Existing far-Earth fix confirmed; no changes.")
        status()
        return
    if IMPORT in original or CALL in original:
        abort("partial or modified patch; refusing to overwrite")
    if MODULE.exists() or IMAGE.exists():
        abort("target files already exist; refusing to overwrite them")
    updated = replace_once(
        original, IMPORT_ANCHOR, IMPORT_ANCHOR + "\n" + IMPORT, "scene import"
    )
    updated = replace_once(
        updated, CALL_ANCHOR,
        CALL_ANCHOR + "\n" + CALL,
        "scene map controller activation",
    )
    STATE.mkdir(parents=True, exist_ok=True)
    if BACKUP.exists() or MANIFEST.exists():
        abort("backup already exists; inspect or roll back before re-applying")
    # Only source authored by the user's own Travis repository is imported.
    shutil.copy2(SCENE, BACKUP)
    try:
        shutil.copy2(PATCH_MODULE, MODULE)
        shutil.copy2(TRAVIS_IMAGE, IMAGE)
        write_atomic(SCENE, updated.encode("utf-8"))
        check_js(SCENE)
        check_js(MODULE)
        manifest = {
            "version": 1,
            "upstream": PIN,
            "scene_original_sha256": sha(BACKUP.read_bytes()),
            "scene_patched_sha256": sha(SCENE.read_bytes()),
            "module_sha256": sha(MODULE.read_bytes()),
            "image_sha256": sha(IMAGE.read_bytes()),
            "source_image": str(TRAVIS_IMAGE),
            "technique": "Android embed only; static ellipsoid above 8,000 km, Esri/OSM below 6,600 km",
        }
        MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        print("Travis far-Earth fallback installed and syntax-checked.")
        status()
    except BaseException:
        shutil.copy2(BACKUP, SCENE)
        for item in (MODULE, IMAGE):
            if item.exists():
                item.unlink()
        raise


def rollback():
    git_check()
    if not BACKUP.is_file() or not MANIFEST.is_file():
        abort("no verified backup; no changes made")
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if sha(SCENE.read_bytes()) != data["scene_patched_sha256"]:
        abort("scene changed since install; manual reconciliation required")
    if any(
        path.is_file() and sha(path.read_bytes()) != data[key]
        for path, key in (
            (MODULE, "module_sha256"),
            (IMAGE, "image_sha256"),
        )
    ):
        abort("a patch-owned file changed since install; manual review required")
    shutil.copy2(BACKUP, SCENE)
    for item in (MODULE, IMAGE):
        if item.exists():
            item.unlink()
    MANIFEST.unlink()
    BACKUP.unlink()
    print("Original GEV scene restored. Restart only GEV for a clean rollback.")
    status()


def status():
    scene = SCENE.read_text(encoding="utf-8") if SCENE.is_file() else ""
    result = {
        "scene_patched": IMPORT in scene and CALL in scene,
        "module_present": MODULE.is_file(),
        "static_earth_present": IMAGE.is_file(),
        "static_earth_bytes": IMAGE.stat().st_size if IMAGE.is_file() else 0,
        "original_scene_backed_up": BACKUP.is_file(),
        "manifest_present": MANIFEST.is_file(),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        action = sys.argv[1] if len(sys.argv) > 1 else ""
        if action == "apply":
            apply()
        elif action == "rollback":
            rollback()
        elif action == "status":
            status()
        else:
            abort("usage: python3 travis-gev-far-earth-apply.py apply|rollback|status")
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
