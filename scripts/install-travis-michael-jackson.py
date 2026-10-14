#!/usr/bin/env python3
# Apply the licensed-photo Michael Jackson holographic face to the ACTIVE local
# Travis UI. Doesn't touch Travis LLM, bridge, voice, server, credentials, or data.
import datetime
import os
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

REPO = "https://raw.githubusercontent.com/crassas/centro-negocios-ia/main/"
PHOTO = ("https://upload.wikimedia.org/wikipedia/commons/e/e6/"
         "Michael_Jackson_publicity_photo_1984.jpg")
ROOT = Path(os.getenv("TRAVIS_UI_DIR", "/root/.centro-ui")).expanduser()
MAIN = ROOT / "travis-3d.mjs"
MODULE = ROOT / "travis-michael-jackson.mjs"
IMAGE = ROOT / "assets/travis/michael-jackson-1984.jpg"

IMPORT = "import {createMichaelJacksonHologram} from './travis-michael-jackson.mjs?v=mj-avatar-1';"
DECLARATION = "  let michaelJacksonAvatar=null;"
BOOT = """
       // A visual identity overlay; the original bust remains the offline fallback.
       void createMichaelJacksonHologram(THREE,realFaceModel,realFaceHead).then(avatar=>{
         michaelJacksonAvatar=avatar;
         hud.dataset.avatarStyle='michael-jackson-hologram';
         hud.dataset.faceAsset='michael-jackson';
       }).catch(error=>console.warn('Travis Michael Jackson portrait fallback:',error));
"""
FRAME = """
    if(michaelJacksonAvatar){
      michaelJacksonAvatar.update({
        time:t,
        build:reducedMotion?1:clamp(t/2.4,0,1),
        dissolve:Math.max(visibleProjection,Math.min(1,(1-formBlend.face)*.93)),
        voice:state==='speaking'?speechLevel:0,
        opacity:Math.max(0,formBlend.face)
      });
    }
"""

def fetch(url, limit=4_000_000):
    request = urllib.request.Request(
        url, headers={"User-Agent": "TravisPortraitInstaller/1.0 (personal hologram)"}
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        content = response.read(limit+1)
    if len(content)>limit:
        raise RuntimeError("Download excede o limite permitido: "+url)
    return content

def patch(source):
    if "michaelJacksonAvatar.update({" in source and IMPORT in source:
        return source, False
    if "michaelJacksonAvatar.update({" in source or IMPORT in source:
        raise RuntimeError("Foi encontrada uma instalação parcial. Não alterei o ficheiro.")
    lines=source.splitlines(keepends=True)
    candidates=[i for i,line in enumerate(lines)
                if line.lstrip().startswith("import ") and
                "travis-holographic-head.mjs" in line]
    if len(candidates)!=1:
        raise RuntimeError("Import do holograma não encontrado de forma inequívoca.")
    lines.insert(candidates[0]+1,IMPORT+"\n")
    source="".join(lines)
    matches=list(re.finditer(r"(?m)^[ \t]*let realFaceReady\s*=\s*false\s*;",source))
    if len(matches)!=1:
        raise RuntimeError("Estado realFaceReady não encontrado de forma inequívoca.")
    source=source[:matches[0].end()]+"\n"+DECLARATION+source[matches[0].end():]
    matches=list(re.finditer(
        r"faceRoot\.add\(\s*realFaceModel\s*\)\s*;\s*realFaceReady\s*=\s*true\s*;",
        source
    ))
    if len(matches)!=1:
        raise RuntimeError("Ponto de activação do busto não encontrado de forma inequívoca.")
    source=source[:matches[0].end()]+"\n"+BOOT+source[matches[0].end():]
    matches=list(re.finditer(
        r"faceRig\?\.update\(\s*state\s*===\s*'speaking'\s*\?\s*speechLevel\s*:\s*0\s*,\s*null\s*\)\s*;",
        source
    ))
    if len(matches)!=1:
        raise RuntimeError("Ciclo de animação facial não encontrado de forma inequívoca.")
    source=source[:matches[0].end()]+"\n"+FRAME+source[matches[0].end():]
    return source, True

def syntax_check(code, suffix, label):
    node=shutil.which("node")
    if not node:
        print("AVISO: Node indisponível. Teste de sintaxe não executado:",label)
        return
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        location=Path(tmp)/("test"+suffix)
        location.write_bytes(code)
        result=subprocess.run([node,"--check",str(location)],text=True,
                              stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        if result.returncode:
            raise RuntimeError(label+": erro de sintaxe JavaScript:\n"+result.stderr)

def verify_image(data):
    if not (data[:3]==b"\xff\xd8\xff" and len(data)>20_000 and data[-2:]==b"\xff\xd9"):
        raise RuntimeError("A fotografia descarregada não é um JPEG válido.")

def atomic_write(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    temporary=path.with_name(path.name+".travis-mj-new")
    temporary.write_bytes(data)
    os.replace(temporary,path)

def main():
    if not MAIN.is_file():
        raise RuntimeError("Travis local não encontrado em "+str(MAIN)+
                           ". Usa TRAVIS_UI_DIR para indicar a instalação correcta.")
    before=MAIN.read_text(encoding="utf-8")
    modified, changed=patch(before)
    print("TRAVIS_MJ_CONFIG=root:",ROOT,"needs_patch:",changed)
    print("A descarregar módulo do repositório e fotografia da Wikimedia Commons…")
    module_data=fetch(REPO+"travis-michael-jackson.mjs",max(200_000,30_000))
    if (b"createMichaelJacksonHologram" not in module_data or
        len(module_data)<3000):
        raise RuntimeError("O módulo recebido não corresponde ao esperado.")
    image_data=fetch(PHOTO)
    verify_image(image_data)
    syntax_check(module_data,".mjs","Módulo MJ")
    syntax_check(modified.encode("utf-8"),".mjs","Travis 3D actualizado")
    stamp=datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup=Path.home()/".travis-backups"/("michael-jackson-"+stamp)
    backup.mkdir(parents=True,exist_ok=False)
    shutil.copy2(MAIN,backup/MAIN.name)
    for target in (MODULE,IMAGE):
        if target.exists():
            shutil.copy2(target,backup/target.name)
    try:
        atomic_write(MODULE,module_data)
        atomic_write(IMAGE,image_data)
        if changed:
            atomic_write(MAIN,modified.encode("utf-8"))
    except Exception:
        shutil.copy2(backup/MAIN.name,MAIN)
        if (backup/MODULE.name).exists():shutil.copy2(backup/MODULE.name,MODULE)
        if (backup/IMAGE.name).exists():shutil.copy2(backup/IMAGE.name,IMAGE)
        raise
    print("TRAVIS_MJ_INSTALLED=true")
    print("TRAVIS_MJ_IMAGE_BYTES="+str(len(image_data)))
    print("TRAVIS_MJ_BACKUP="+str(backup))
    print("Travis continua a ser o mesmo assistente. Fecha e volta a abrir a UI.")
    print("Fonte da imagem: Wikimedia Commons / Matthew Rolston, Epic Records (1984).")

if __name__=="__main__":
    try:
        main()
    except Exception as exc:
        print("TRAVIS_MJ_INSTALLED=false; ERRO:",exc,file=sys.stderr)
        sys.exit(1)
