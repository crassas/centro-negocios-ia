#!/usr/bin/env python3
"""Additive, reversible local road-data/voice links for Travis.

Shares the existing 4187 public CCTV gateway; NO second agent and NO
arbitrary network proxy. Does not restart Jarvis, Centro or God's Eye.
The existing Travis World watcher calls ensure_road_links() AFTER its
normal UI repair. Every insertion has a unique anchor and a backup.
"""
from __future__ import annotations
import json
import os
import subprocess
from pathlib import Path

HOME=Path.home()
UI=HOME/".centro-ui"
STATE=HOME/".centro-extensions"
INDEX=UI/"index.html"
VOICE=UI/"travis-3d.mjs"
CSS=UI/"travis-road-live.css"
MODULE=UI/"travis-road-live.mjs"
BRIDGE=UI/"travis-gev-bridge.mjs"
GATEWAY=STATE/"travis-cctv-gateway.mjs"
PREF=STATE/"travis-road-"
BACKUP_HTML=STATE/"index-before-road-live-20261010.html"
BACKUP_VOICE=STATE/"travis-3d-before-road-live-20261010.mjs"
CSS_TAG='<link rel="stylesheet" href="./travis-road-live.css?v=road-real-1">'
JS_TAG='<script type="module" src="./travis-road-live.mjs?v=road-real-1"></script>'
CSS_ANCHOR='<link rel="stylesheet" href="./travis-gev-bridge.css?v=gev-17b">'
JS_ANCHOR='<script type="module" src="./travis-cctv-autopilot.mjs?v=auto-1"></script>'
VOICE_ANCHOR='      const worldIntent=window.TravisWorld?.routeCommand?.(text);'
VOICE_MARK='      const liveRoadIntent=window.TravisRoadLive?.routeCommand?.(text);'
VOICE_BLOCK="""      // Live road observations come from named public providers. They are NOT
      // the simulated moving vehicle layer in the official God's Eye View.
      const liveRoadIntent=window.TravisRoadLive?.routeCommand?.(text);
      if(liveRoadIntent?.handled){
        const spoken=String(liveRoadIntent.reply||'Public road information requested.');
        observeLocal(interactionId,text,spoken);
        const locale=liveRoadIntent.language||'pt';
        replyLanguage=locale;
        setState('thinking',spoken);
        const roadVoice=await localFetch('/speak',{
          body:{text:spoken,language:locale},signal:controller.signal
        });
        if(roadVoice.ok){
          await playVoiceArrayBuffer(await roadVoice.arrayBuffer(),session,spoken);
        }else{
          voiceBusy=false;setState('ready',spoken);scheduleListening(session,180);
        }
        return;
      }
"""
def _swap(path,before,after):
    tmp=path.with_name(path.name+".road-live.tmp")
    tmp.write_text(after,encoding="utf-8")
    os.chmod(tmp,path.stat().st_mode & 0o777)
    tmp.replace(path)

HLS_PLAYER=UI/"travis-cctv-player.mjs"
HLS_INSTALLER=STATE/"travis-hls-android-patch.py"
HLS_MARKER="TRAVIS_HLS_PUBLIC_VIDEO_V1"

def ensure_public_hls_video():
    """Keep slow-start HLS video tuned without touching upstream camera sources."""
    if not HLS_PLAYER.is_file() or not HLS_INSTALLER.is_file():
        return False
    text=HLS_PLAYER.read_text(encoding="utf-8")
    if HLS_MARKER in text:return True
    try:
        proc=subprocess.run(["python3",str(HLS_INSTALLER),"apply"],
                            check=False,capture_output=True,timeout=12,text=True)
        if proc.returncode!=0:
            print("[watch] travis-hls · patch declined",flush=True)
            return False
        return HLS_MARKER in HLS_PLAYER.read_text(encoding="utf-8")
    except (OSError,subprocess.SubprocessError):
        return False

def ensure_road_links():
    if not all(x.is_file() for x in (INDEX,VOICE,CSS,MODULE,BRIDGE,GATEWAY)):
        return False
    if "handleRoadLive" not in GATEWAY.read_text(encoding="utf-8"):
        return False # Do not claim road data works if the gateway was replaced.
    try:
        html=INDEX.read_text(encoding="utf-8")
        updated=html
        if CSS_TAG not in updated:
            if updated.count(CSS_ANCHOR)!=1:return False
            updated=updated.replace(CSS_ANCHOR,CSS_ANCHOR+"\n  "+CSS_TAG,1)
        if JS_TAG not in updated:
            if updated.count(JS_ANCHOR)!=1:return False
            updated=updated.replace(JS_ANCHOR,JS_ANCHOR+"\n  "+JS_TAG,1)
        if updated!=html:
            if not BACKUP_HTML.exists():BACKUP_HTML.write_text(html,encoding="utf-8")
            _swap(INDEX,html,updated)
            print("[watch] travis-road · live public road UI linked",flush=True)
        js=VOICE.read_text(encoding="utf-8")
        if VOICE_MARK not in js:
            if js.count(VOICE_ANCHOR)!=1:return False
            out=js.replace(VOICE_ANCHOR,VOICE_BLOCK+VOICE_ANCHOR,1)
            tmp=VOICE.with_name("travis-3d.road-check.mjs")
            try:
                tmp.write_text(out,encoding="utf-8")
                subprocess.run(["node","--check",str(tmp)],
                    check=True,capture_output=True,timeout=12)
            finally:
                tmp.unlink(missing_ok=True)
            if not BACKUP_VOICE.exists():BACKUP_VOICE.write_text(js,encoding="utf-8")
            _swap(VOICE,js,out)
            print("[watch] travis-road · live public road voice route linked",flush=True)
        ensure_public_hls_video()
        return True
    except (OSError,ValueError,subprocess.SubprocessError) as e:
        print("[watch] travis-road · declined:",type(e).__name__,flush=True)
        return False

def status():
    html=INDEX.read_text(encoding="utf-8")
    js=VOICE.read_text(encoding="utf-8")
    return {"ui":CSS_TAG in html and JS_TAG in html,
        "voice":VOICE_MARK in js,
        "gateway":GATEWAY.is_file() and "handleRoadLive" in GATEWAY.read_text(encoding="utf-8"),
        "sourceCode":CSS.is_file() and MODULE.is_file(),
        "backups":BACKUP_HTML.exists() and BACKUP_VOICE.exists()}

if __name__=="__main__":
    import sys
    action=sys.argv[1] if len(sys.argv)>1 else "status"
    if action=="apply":print("apply:",ensure_road_links())
    elif action=="status":print(json.dumps(status(),ensure_ascii=False,indent=2))
    else:raise SystemExit("Use apply|status")
