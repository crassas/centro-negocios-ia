#!/usr/bin/env python3
"""Travis/Michael Jackson GLB v4: compatible, non-destructive Android UI repair.

Only updates the holographic UI assets, a few verified frontend anchors and
local cache; never edits Travis intelligence, voice, Bridge, or credentials.
Failed prechecks leave every local file unchanged and print useful diagnostics.
"""
import datetime
import hashlib
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT=Path(os.environ.get("TRAVIS_UI_DIR","/root/.centro-ui")).expanduser()
MAIN=ROOT/"travis-3d.mjs"
MODULE=ROOT/"travis-michael-jackson-3d.mjs"
MODEL=ROOT/"assets/travis/travis-michael-jackson-3d.glb"
LICENSE=ROOT/"assets/travis/MICHAEL_JACKSON_3D_CREDITS.md"
INDEX=ROOT/"index.html"
SW=ROOT/"sw.js"
BASE="https://raw.githubusercontent.com/crassas/centro-negocios-ia/main/"
V="mj3d-4"
IMPORT="import {styleMichaelJacksonHair, MJ3D_ASSET, loadMJ3DOrOriginal} from './travis-michael-jackson-3d.mjs?v=mj3d-4';"
HOOK="styleMichaelJacksonHair(THREE,realFaceModel,realFaceBaseMaterial.uniforms);"
SAFE_HOOK="if(preferMJ) "+HOOK

OLD_PHOTO={
 "import":r"(?m)^[ \t]*import\s*\{\s*createMichaelJacksonHologram\s*\}\s*from\s*['\"][^'\"]+['\"];[ \t]*\n",
 "declaration":r"(?m)^[ \t]*let\s+michaelJacksonAvatar\s*=\s*null\s*;[ \t]*\n",
 "boot":r"(?ms)^[ \t]*void\s+createMichaelJacksonHologram\(THREE,\s*realFaceModel,\s*realFaceHead\)\.then\(avatar=>\{.*?\}\)\.catch\(error=>console\.warn\([^\n]*?\)\);[ \t]*\n",
 "frame":r"(?ms)^[ \t]*if\s*\(michaelJacksonAvatar\)\s*\{\s*michaelJacksonAvatar\.update\(\{.*?\}\);\s*\}[ \t]*\n",
}

# Only the face model is a candidate: no other GLTFLoader calls are modified.
LOADER=re.compile(
 r"new\s+GLTFLoader\s*\(\s*\)\s*\.loadAsync\s*\(\s*"
 r"(?P<arg>MJ3D_ASSET|asset|['\"]\./assets/travis/travis-"
 r"(?:face-bust|michael-jackson-3d)\.glb(?:\?[^'\"]*)?['\"])"
 r"\s*\)"
)
MODEL_IMPORT=re.compile(
 r"(?m)^[ \t]*import\s*\{[^}]*\bstyleMichaelJacksonHair\b[^}]*\}\s*"
 r"from\s*(['\"])\./travis-michael-jackson-3d\.mjs(?:\?[^'\"]*)?\1\s*;[ \t]*$"
)
HTML_MODULE=re.compile(
 r"""(?P<before><script\b[^>]*?\bsrc=['"])(?P<url>\./travis-3d\.mjs\?[^'"]+)(?P<after>['"])""",
 re.I
)

def diagnostic(src):
    lines=src.splitlines()
    clues=[]
    words=("createFaceAvatar", "loadAsync(", "face-bust.glb",
           "michael-jackson-3d.glb", "MichaelJacksonHologram",
           "styleMichaelJacksonHair", "travis-holographic-head")
    for i,line in enumerate(lines):
        if any(token in line for token in words):
            clues.append({"line":i+1,"snippet":line.strip()[:180]})
    return {"sha256":hashlib.sha256(src.encode()).hexdigest()[:16],
            "size":len(src),"face_clues":clues[:22]}

def remove_photo(src):
    if "michaelJacksonAvatar" not in src and "createMichaelJacksonHologram" not in src:
        return src
    for _,expression in OLD_PHOTO.items():
        src=re.sub(expression,"",src,count=1)
    if "michaelJacksonAvatar" in src or "createMichaelJacksonHologram" in src:
        raise RuntimeError(
            "Sobreposição fotográfica antiga com formato diferente; não substituí o código. "
            "Diagnóstico: "+json.dumps(diagnostic(src),ensure_ascii=False))
    return src

def patch(src):
    """Patches original, photo-era, 3D v1/v2 and custom local face-loader variants.

    One minimal model-loading expression is wrapped with automatic recovery.
    Does not replace/create whole functions nor rely on precise catch blocks.
    """
    original=src
    src=remove_photo(src)
    found=list(MODEL_IMPORT.finditer(src))
    if len(found)>1:
        raise RuntimeError("Mais do que uma importação MJ3D; instalação não alterada")
    if len(found)==1:
        src=MODEL_IMPORT.sub(IMPORT,src,count=1)
    elif IMPORT not in src:
        imports=[m for m in re.finditer(
            r"(?m)^[ \t]*import\s+[^;\n]*travis-holographic-head\.mjs[^;\n]*;[ \t]*\n",
            src)]
        if len(imports)!=1:
            raise RuntimeError("Não encontrei o módulo facial de forma inequívoca. "+
                               json.dumps(diagnostic(src),ensure_ascii=False))
        index=imports[0].end()
        src=src[:index]+IMPORT+"\n"+src[index:]
    # Every possible supported loader either uses the reliable wrapper or the
    # original GLB location. Even an already installed 3D v2 now gets recovery.
    matches=list(LOADER.finditer(src))
    if "loadMJ3DOrOriginal(new GLTFLoader()" not in src:
        if len(matches)!=1:
            raise RuntimeError(
                "Modelo facial 3D com um caminho desconhecido. Mantive a instalação. "+
                json.dumps(diagnostic(src),ensure_ascii=False))
        request=matches[0].group("arg")
        if "face-bust.glb" in request:
            request="MJ3D_ASSET"
        repl="loadMJ3DOrOriginal(new GLTFLoader(),"+request+")"
        src=src[:matches[0].start()]+repl+src[matches[0].end():]
    # Shader hook is needed for the licensed 3D mesh, but is a harmless no-op
    # if recovery loaded the original CC0 bust.
    if HOOK not in src:
        insert_at=re.search(r"head\.material\s*=\s*realFaceBaseMaterial\s*;",src)
        if not insert_at or len(re.findall(r"head\.material\s*=\s*realFaceBaseMaterial\s*;",src))!=1:
            raise RuntimeError("Não encontrei a ligação facial do Travis com segurança. "+
                               json.dumps(diagnostic(src),ensure_ascii=False))
        i=insert_at.end()
        src=src[:i]+"\n      "+HOOK+src[i:]
    # Existing hooks (including safe if(preferMJ) hooks) are preserved.
    if "loadMJ3DOrOriginal(new GLTFLoader()" not in src:
        raise RuntimeError("O carregamento de recuperação não ficou ligado")
    if IMPORT not in src or HOOK not in src:
        raise RuntimeError("O material MJ3D não ficou ligado")
    # Only update known status labels; the original 3D head is a real fallback.
    src=src.replace(
      "hud.dataset.faceAsset='bust';hud.dataset.avatarStyle='laser-hologram';",
      "hud.dataset.faceAsset=realFaceModel.getObjectByName('TravisMJ_Licensed_Head')?'mj-3d':'fallback-bust';"+
      "hud.dataset.avatarStyle='michael-jackson-3d';",1)
    return src,src!=original

def update_index(src):
    found=list(HTML_MODULE.finditer(src))
    if len(found)!=1:
        return src,False
    url=found[0].group("url")
    cleaned=re.sub(r"(?:&|%26)mj3d-repair=[^&\"']*","",url)
    target=cleaned+"&mj3d-repair=4"
    return src[:found[0].start("url")]+target+src[found[0].end("url"):],url!=target

def update_sw(src):
    result,n=re.subn(r"(?m)^(const CACHE=['\"])([^'\"]+)(['\"])",
        lambda m:m.group(1)+re.sub(r"-mj3d(?:-v\d+|-r\d+)?$","",m.group(2))+"-mj3d-r4"+m.group(3),
        src,count=1)
    if n!=1:raise RuntimeError("Cache SW desconhecida; operação não aplicada")
    return result,result!=src

def fetch(url,max_bytes):
    req=urllib.request.Request(url,headers={
        "User-Agent":"Travis-MJ3D-Recovery/4","Cache-Control":"no-cache"})
    with urllib.request.urlopen(req,timeout=35) as response:
        blob=response.read(max_bytes+1)
    if not blob or len(blob)>max_bytes:
        raise RuntimeError("Download vazio ou maior que o limite: "+url)
    return blob

def check_glb(blob):
    if len(blob)<100_000 or blob[:4]!=b"glTF":
        raise RuntimeError("Modelo 3D inválido: sem assinatura glTF")
    total=struct.unpack_from("<I",blob,8)[0]
    jsonsize,kind=struct.unpack_from("<II",blob,12)
    if total!=len(blob) or kind!=0x4e4f534a or jsonsize>len(blob)-20:
        raise RuntimeError("Modelo GLB incompleto")
    doc=json.loads(blob[20:20+jsonsize].decode("utf-8"))
    names={n.get("name") for n in doc.get("nodes",[])}
    must={"TravisFace_Bust","TravisMJ_Licensed_Head"}
    must.update("TravisFace_"+which+"_"+side for which in
                ("Eye","Iris","Pupil") for side in ("L","R"))
    if must-names:raise RuntimeError("Modelo sem estrutura facial: "+str(sorted(must-names)))
    return {"bytes":len(blob),"meshes":len(doc.get("meshes",[])),"anchors":len(must)}

def node_check(content,label):
    node=shutil.which("node")
    if not node:
        raise RuntimeError("Node.js indisponível para verificar "+label)
    with tempfile.NamedTemporaryFile(suffix=".mjs",delete=False) as f:
        tmp=Path(f.name);f.write(content)
    try:
        proc=subprocess.run([node,"--check",str(tmp)],capture_output=True,
                            text=True,timeout=30)
        if proc.returncode:
            raise RuntimeError(label+" tem erro de sintaxe: "+proc.stderr[-1200:])
    finally:tmp.unlink(missing_ok=True)

def atomic_write(path,content):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_name(path.name+".mj3d-r4-new")
    temp.write_bytes(content)
    os.replace(temp,path)

def verify_served():
    routes={
      "model":("/assets/travis/travis-michael-jackson-3d.glb?v=mj3d-4",b"glTF"),
      "material":("/travis-michael-jackson-3d.mjs?v=mj3d-4",b"/**"),
      "javascript":("/travis-3d.mjs?v=continuous-2&mj3d-repair=4",b"import "),
    }
    report={}
    for name,(route,signature) in routes.items():
        try:
            req=urllib.request.Request("http://127.0.0.1:8770"+route,
                headers={"Cache-Control":"no-store"})
            with urllib.request.urlopen(req,timeout=5) as res:
                head=res.read(300)
                report[name]=res.status==200 and head.lstrip().startswith(signature)
        except Exception as e:report[name]=type(e).__name__+": "+str(e)[:100]
    return report

def main():
    if not MAIN.is_file():
        raise RuntimeError("Não encontrei Travis em "+str(MAIN))
    before=MAIN.read_text("utf-8")
    updated,modified=patch(before)
    if not modified:
        print("TRAVIS_MJ3D_PATCH=already compatible")
    else:
        print("TRAVIS_MJ3D_PATCH=compatible local variant")
    print("A obter o modelo Blender 3D e as dependências verificadas…",flush=True)
    model=fetch(BASE+"assets/travis/travis-michael-jackson-3d.glb",12_000_000)
    properties=check_glb(model)
    module=fetch(BASE+"travis-michael-jackson-3d.mjs",100_000)
    attribution=fetch(BASE+"assets/travis/MICHAEL_JACKSON_3D_CREDITS.md",100_000)
    if b"loadMJ3DOrOriginal" not in module or b"MJ3D_ASSET" not in module:
        raise RuntimeError("Módulo de recuperação 3D incompleto")
    node_check(module,"Material Michael Jackson")
    node_check(updated.encode("utf-8"),"Interface Travis")
    staged=[
      (MODEL,model),(MODULE,module),(LICENSE,attribution),
    ]
    if SW.is_file():
        newsw,changed=update_sw(SW.read_text("utf-8"))
        node_check(newsw.encode("utf-8"),"Cache Travis")
        if changed:staged.append((SW,newsw.encode("utf-8")))
    staged.append((MAIN,updated.encode("utf-8")))
    if INDEX.is_file():
        newindex,changed=update_index(INDEX.read_text("utf-8"))
        if changed:staged.append((INDEX,newindex.encode("utf-8")))
    backup=(Path.home()/".travis-backups"/
            ("mj3d-recovery-"+datetime.datetime.now().strftime("%Y%m%d-%H%M%S-%f")))
    backup.mkdir(parents=True,exist_ok=False)
    manifest=[]
    for path,content in staged:
        relative=path.relative_to(ROOT)
        saved=backup/relative
        original=path.is_file()
        if original:
            saved.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(path,saved)
        manifest.append({"path":str(relative),"had_original":original,
                         "new_sha256":hashlib.sha256(content).hexdigest()})
    (backup/"manifest.json").write_text(json.dumps(manifest,indent=2))
    try:
        for path,content in staged:atomic_write(path,content)
    except Exception:
        for item in reversed(manifest):
            local=ROOT/item["path"]
            saved=backup/item["path"]
            if item["had_original"]:shutil.copy2(saved,local)
            else:local.unlink(missing_ok=True)
        raise
    served=verify_served()
    print("TRAVIS_MJ3D_HTTP="+json.dumps(served,sort_keys=True))
    print("TRAVIS_MJ3D_BACKUP="+str(backup))
    print("TRAVIS_MJ3D_INSTALLED=true")
    print("TRAVIS_MJ3D_MODEL="+json.dumps(properties,sort_keys=True))
    if not all(v is True for v in served.values()):
        print("TRAVIS_MJ3D_WARNING=Os ficheiros foram instalados, mas algumas rotas HTTP do Travis 8770 não responderam. O rosto pode continuar invisível.")
    else:
        print("TRAVIS_MJ3D_READY=Files and HTTP routes verified. Fecha e volta a abrir o Travis.")

if __name__=="__main__":
    try:main()
    except Exception as e:
        print("TRAVIS_MJ3D_INSTALLED=false; ERRO: "+str(e),file=sys.stderr)
        sys.exit(1)
