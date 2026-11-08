#!/usr/bin/env python3
"""Reversible HLS buffer/start tuning for Travis's existing public CCTV player.

Does not make periodic JPEG cameras into video. Optimizes only *registered*
HLS feeds which have been checked via upstream media leases.
"""
from pathlib import Path
import os
import subprocess
import sys
import hashlib
PLAYER=Path("/root/.centro-ui/travis-cctv-player.mjs")
BACKUP=Path("/root/.centro-extensions/travis-cctv-player.before-hls-20261010.mjs")
MARK="// TRAVIS_HLS_PUBLIC_VIDEO_V1 · give slow Android HLS playlists time to start."
OLD_BUFFER="""     hls=new Hls({
       enableWorker:false,maxBufferLength:12,maxMaxBufferLength:22,
       maxBufferSize:12*1024*1024,
       manifestLoadingTimeOut:14000,fragLoadingTimeOut:14000
     });"""
NEW_BUFFER="""     // TRAVIS_HLS_PUBLIC_VIDEO_V1 · give slow Android HLS playlists time to start.
     hls=new Hls({
       enableWorker:false,maxBufferLength:9,maxMaxBufferLength:18,
       maxBufferSize:10*1024*1024,
       liveSyncDurationCount:2,liveMaxLatencyDurationCount:6,
       manifestLoadingTimeOut:19000,fragLoadingTimeOut:21000
     });"""
OLD_ERROR="""     hls.on(Hls.Events.ERROR,(_event,e)=>{
       if(e?.fatal&&mine===seq&&mode==='video'&&!playing)
         void showImage(cameraId,{reason:'HLS unavailable; trying original camera image.'});
     });"""
NEW_ERROR="""     let hlsRetried=false;
     hls.on(Hls.Events.ERROR,(_event,e)=>{
       if(!e?.fatal||mine!==seq||mode!=='video'||playing)return;
       if(!hlsRetried&&e.type===Hls.ErrorTypes.NETWORK_ERROR){
         hlsRetried=true;
         message('Public HLS stream slow; one reconnect attempt. Not yet verified.');
         try{hls?.startLoad(-1);}catch{}
         return;
       }
       void showImage(cameraId,{reason:'Video could not be verified; checking a genuine still image.'});
     });"""
OLD_TIMEOUT="""   refreshTimer=setTimeout(()=>{
     if(open&&mine===seq&&mode==='video'&&!playing)
       void showImage(cameraId,{reason:'HLS timed out; checking original image.'});
   },18000);"""
NEW_TIMEOUT="""   refreshTimer=setTimeout(()=>{
     if(open&&mine===seq&&mode==='video'&&!playing)
       void showImage(cameraId,{reason:'Public HLS did not start; checking a genuine still image.'});
   },33000);"""
def patch(text):
    if MARK in text:return text
    for a,b in [(OLD_BUFFER,NEW_BUFFER),(OLD_ERROR,NEW_ERROR),(OLD_TIMEOUT,NEW_TIMEOUT)]:
        if text.count(a)!=1:raise RuntimeError("HLS source changed; no patch applied")
        text=text.replace(a,b,1)
    return text
def syntax(text):
    temp=PLAYER.with_name("travis-cctv-player.hls-check.mjs")
    try:
        temp.write_text(text,encoding="utf-8")
        subprocess.run(["node","--check",str(temp)],check=True,capture_output=True,timeout=12)
    finally:temp.unlink(missing_ok=True)
def run(command):
    src=PLAYER.read_text(encoding="utf-8")
    if command=="status":
        print({"patched":MARK in src,"backup":BACKUP.exists()})
        return
    if command=="apply":
        out=patch(src);syntax(out)
        if out==src:
            print("HLS_PATCH_ALREADY_PRESENT");return
        if not BACKUP.exists():BACKUP.write_text(src,encoding="utf-8")
        tmp=PLAYER.with_name("travis-cctv-player.hls-apply.mjs")
        tmp.write_text(out,encoding="utf-8")
        os.chmod(tmp,PLAYER.stat().st_mode & 0o777)
        tmp.replace(PLAYER)
        print("HLS_BUFFER_FIX_APPLIED")
        return
    if command=="rollback":
        if not BACKUP.exists() or MARK not in src:raise RuntimeError("No owned patch to roll back")
        original=BACKUP.read_text(encoding="utf-8")
        syntax(original)
        tmp=PLAYER.with_name("travis-cctv-player.hls-rollback.mjs")
        tmp.write_text(original,encoding="utf-8")
        os.chmod(tmp,PLAYER.stat().st_mode & 0o777)
        tmp.replace(PLAYER)
        print("HLS_ORIGINAL_RESTORED")
        return
    raise ValueError("Usage: apply|status|rollback")
if __name__=="__main__":
    try:run(sys.argv[1] if len(sys.argv)>1 else "status")
    except (OSError,ValueError,RuntimeError,subprocess.SubprocessError) as e:
        print(str(e),file=sys.stderr);sys.exit(1)
