#!/usr/bin/env python3
"""Instala o busto Blender 3D na interface Travis em Android, com cópia de segurança.
Remove a sobreposição de fotografia antiga, sem alterar voz, memória ou bridge.
"""
import datetime, json, os, re, shutil, struct, subprocess, sys, tempfile, urllib.request
from pathlib import Path

REPO="https://raw.githubusercontent.com/crassas/centro-negocios-ia/main/"
ROOT=Path(os.getenv("TRAVIS_UI_DIR","/root/.centro-ui")).expanduser()
MAIN=ROOT/"travis-3d.mjs"
SW=ROOT/"sw.js"
MODULE=ROOT/"travis-michael-jackson-3d.mjs"
GLB=ROOT/"assets/travis/travis-michael-jackson-3d.glb"
IMPORT="import {styleMichaelJacksonHair, MJ3D_ASSET} from './travis-michael-jackson-3d.mjs?v=mj3d-2';"
OLD_MJ3D_IMPORT="import {styleMichaelJacksonHair, MJ3D_ASSET} from './travis-michael-jackson-3d.mjs?v=mj3d-1';"
HOOK="      styleMichaelJacksonHair(THREE,realFaceModel,realFaceBaseMaterial.uniforms);"
SAFE_HOOK="      if(preferMJ) styleMichaelJacksonHair(THREE,realFaceModel,realFaceBaseMaterial.uniforms);"
LOADER=r"(['\"])\./assets/travis/travis-face-bust\.glb(?:\?[^'\"]*)?\1"
LICENSE=ROOT/"assets/travis/MICHAEL_JACKSON_3D_CREDITS.md"
OLD_PHOTO_IMPORT=r"(?m)^\s*import\s*\{\s*createMichaelJacksonHologram\s*\}\s*from\s*['\"][^'\"]+['\"];\s*\n"
OLD_PHOTO_DECL=r"(?m)^[ \t]*let\s+michaelJacksonAvatar\s*=\s*null\s*;[ \t]*\n"
OLD_PHOTO_BOOT=r"(?ms)^[ \t]*void\s+createMichaelJacksonHologram\(THREE,\s*realFaceModel,\s*realFaceHead\)\.then\(avatar=>\{.*?\}\)\.catch\(error=>console\.warn\([^\n]*?\)\);[ \t]*\n"
OLD_PHOTO_FRAME=r"(?ms)^[ \t]*if\s*\(michaelJacksonAvatar\)\s*\{\s*michaelJacksonAvatar\.update\(\{.*?\}\);\s*\}[ \t]*\n"

def fetch(url, max_bytes):
    req=urllib.request.Request(url,headers={"User-Agent":"Travis-Blender-3D-Installer/1.0"})
    with urllib.request.urlopen(req,timeout=45) as res: data=res.read(max_bytes+1)
    if len(data)>max_bytes: raise RuntimeError("Asset exceeds mobile performance size limit: "+url)
    return data

def inspect_glb(data):
    if not(data[:4]==b"glTF" and 150000<len(data)<12_000_000):
        raise RuntimeError("3D binary missing, incomplete or oversized")
    if struct.unpack_from("<I",data,8)[0]!=len(data):
        raise RuntimeError("3D GLB payload truncated")
    size,ctype=struct.unpack_from("<II",data,12)
    if ctype!=0x4e4f534a or size>len(data)-20:
        raise RuntimeError("Invalid 3D scene JSON chunk")
    scene=json.loads(data[20:20+size].decode("utf-8"))
    names={node.get("name") for node in scene.get("nodes",[])}
    expected={"TravisFace_Bust","TravisMJ_Licensed_Head"}
    expected.update("TravisFace_"+part+"_"+side for part in ("Eye","Iris","Pupil") for side in ("L","R"))
    if expected-names: raise RuntimeError("3D mesh missing animation anchors: "+str(sorted(expected-names)))
    return len(data),len(scene.get("meshes",[]))

def clean_photo_overlay(source):
    if "michaelJacksonAvatar" not in source and "createMichaelJacksonHologram" not in source:
        return source,False
    before=source
    # Strictly remove the previously installed photo overlay, never unknown code.
    expressions=[
        (OLD_PHOTO_BOOT,"createMichaelJacksonHologram(THREE" in source),
        (OLD_PHOTO_FRAME,"michaelJacksonAvatar.update({" in source),
        (OLD_PHOTO_IMPORT,"import {createMichaelJacksonHologram}" in source),
        (OLD_PHOTO_DECL,"let michaelJacksonAvatar" in source)]
    for expression,required in expressions:
        source,n=re.subn(expression,"",source,count=1)
        if required and n!=1: raise RuntimeError("Unknown older portrait patch; active Travis not modified")
    if "michaelJacksonAvatar" in source or "createMichaelJacksonHologram" in source:
        raise RuntimeError("Remaining portrait hooks prevent safe migration")
    return source,source!=before

def ensure_face_recovery(source):
    # Installing assets alone is not enough: if a GLB fails or Android loses
    # a response, restore Travis's original real 3D face rather than a black UI.
    if "async function createFaceAvatar({asset=MJ3D_ASSET" in source:
        return source
    adaptations = [
        (
            "  async function createFaceAvatar() {\n    faceRoot=new THREE.Group();",
            "  async function createFaceAvatar({asset=MJ3D_ASSET,preferMJ=true}={}) {\n"
            "    faceEyeGroups=[];\n    holographicEyeMaterials.length=0;\n"
            "    realFaceReady=false;\n    faceRoot=new THREE.Group();"
        ),
        (
            "      const gltf=await new GLTFLoader().loadAsync(MJ3D_ASSET);",
            "      const gltf=await new GLTFLoader().loadAsync(asset);"
        ),
        (
            "      styleMichaelJacksonHair(THREE,realFaceModel,realFaceBaseMaterial.uniforms);",
            "      if(preferMJ) styleMichaelJacksonHair(THREE,realFaceModel,realFaceBaseMaterial.uniforms);"
        ),
        (
            "      hud.dataset.faceAsset='mj-3d';hud.dataset.avatarStyle='michael-jackson-3d';",
            "      hud.dataset.faceAsset=preferMJ?'mj-3d':'fallback-bust';\n"
            "      hud.dataset.avatarStyle=preferMJ?'michael-jackson-3d':'laser-hologram';\n"
            "      hud.dataset.visualFallback=preferMJ?'none':'original-blender-bust';"
        ),
        (
            "    } catch(error) {\n"
            "      hud.dataset.faceAsset='error';\n"
            "      console.error('Travis anatomical bust failed:',error);\n"
            "      // Keep the real core available; never display a synthetic substitute head.\n"
            "      setLoading('Face unavailable · core online');\n"
            "      throw error;\n"
            "    }",
            "    } catch(error) {\n"
            "      console.error('Travis anatomical bust failed:',error);\n"
            "      hud.dataset.faceError=String(error?.message||error).slice(0,240);\n"
            "      if(preferMJ){\n"
            "        console.warn('Travis: MJ asset failed. Restoring the original Blender face.');\n"
            "        setLoading('Restoring original 3D face…');\n"
            "        return createFaceAvatar({asset:'./assets/travis/travis-face-bust.glb?v=1',preferMJ:false});\n"
            "      }\n"
            "      hud.dataset.faceAsset='error';\n"
            "      setLoading('3D face unavailable · brain online');\n"
            "      throw error;\n"
            "    }"
        )
    ]
    for before,after in adaptations:
        if source.count(before)!=1:
            raise RuntimeError("Reparação 3D não corresponde à versão local; sem alterações no Travis")
        source=source.replace(before,after,1)
    return source

def patch(source):
    text,removed=clean_photo_overlay(source)
    using_model=("travis-michael-jackson-3d.glb" in text or
                 "loadAsync(MJ3D_ASSET)" in text or
                 "createFaceAvatar({asset=MJ3D_ASSET" in text)
    # Already migrated to the 3D model: only refresh its imported version.
    if ((HOOK in text or SAFE_HOOK in text) and using_model and
            (IMPORT in text or OLD_MJ3D_IMPORT in text)):
        text=text.replace(OLD_MJ3D_IMPORT,IMPORT)
        # Older integrations used a literal path; keep the model loader canonical.
        text=text.replace(
            "'./assets/travis/travis-michael-jackson-3d.glb?v=mj3d-1'",
            "MJ3D_ASSET")
        text=ensure_face_recovery(text)
        return text,text!=source
    if IMPORT in text or OLD_MJ3D_IMPORT in text or HOOK in text or SAFE_HOOK in text or using_model:
        raise RuntimeError("Integração 3D incompleta ou não reconhecida; não foram alterados ficheiros")
    imports=[line for line in text.splitlines(True)
             if "travis-holographic-head.mjs" in line and
             line.lstrip().startswith("import ")]
    if len(imports)!=1:
        raise RuntimeError("Importação da cabeça Travis não encontrada com segurança")
    text=text.replace(imports[0],imports[0]+IMPORT+"\n",1)
    text,matches=re.subn(LOADER,"MJ3D_ASSET",text,count=1)
    if matches!=1:
        raise RuntimeError("Busto GLB original não encontrado com segurança")
    base="head.material=realFaceBaseMaterial;"
    if text.count(base)!=1:
        raise RuntimeError("Material da cabeça original não encontrado com segurança")
    text=text.replace(base,base+"\n"+HOOK,1)
    text=text.replace(
        "hud.dataset.faceAsset='bust';hud.dataset.avatarStyle='laser-hologram';",
        "hud.dataset.faceAsset='mj-3d';hud.dataset.avatarStyle='michael-jackson-3d';",1)
    text=ensure_face_recovery(text)
    return text,True

def node_check(data,label):
    node=shutil.which("node")
    if not node: raise RuntimeError("Node.js is required to validate "+label+" before updating Travis")
    with tempfile.NamedTemporaryFile(suffix=".mjs",delete=False) as f:
        f.write(data);location=f.name
    try:
        r=subprocess.run([node,"--check",location],capture_output=True,text=True,timeout=25)
        if r.returncode: raise RuntimeError(label+" syntax: "+r.stderr[-900:])
    finally: Path(location).unlink(missing_ok=True)

def atomic_write(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_name(path.name+".mj3d-new")
    temp.write_bytes(data);os.replace(temp,path)

def main():
    if not MAIN.exists(): raise RuntimeError("Active Travis 3D UI missing: "+str(ROOT))
    original=MAIN.read_text("utf-8")
    revised,changed=patch(original)
    print("TRAVIS_MJ3D_PRECHECK="+json.dumps({"path":str(ROOT),"patch":changed}))
    print("A descarregar o busto genuíno do Blender e o material holográfico…",flush=True)
    model=fetch(REPO+"assets/travis/travis-michael-jackson-3d.glb",12_000_000)
    size,meshes=inspect_glb(model)
    shader=fetch(REPO+"travis-michael-jackson-3d.mjs",120_000)
    licence=fetch(REPO+"assets/travis/MICHAEL_JACKSON_3D_CREDITS.md",80_000)
    if b"styleMichaelJacksonHair" not in shader or b"MJ3D_ASSET" not in shader:
        raise RuntimeError("Unexpected 3D material module")
    node_check(shader,"3D material")
    node_check(revised.encode(),"Travis native 3D and voice")
    sw_old=SW.read_text("utf-8") if SW.exists() else None
    sw_new=sw_old
    if sw_old and not re.search(r"(?m)^const CACHE=['\"][^'\"]*-mj3d-v2['\"]",sw_old):
        sw_new,n=re.subn(r"(?m)^(const CACHE=['\"])([^'\"]+)(['\"])",
            lambda m:m.group(1)+re.sub(r"-mj3d(?:-v2)?$","",m.group(2))+"-mj3d-v2"+m.group(3),
            sw_old,count=1)
        if n!=1: raise RuntimeError("Cannot safely refresh offline SW cache")
        node_check(sw_new.encode(),"Travis service worker")
    backup=Path.home()/".travis-backups"/("mj3d-"+datetime.datetime.now().strftime("%Y%m%dT%H%M%S"))
    backup.mkdir(parents=True,exist_ok=False)
    targets=[(MAIN,revised.encode()),(MODULE,shader),(GLB,model),(LICENSE,licence)]
    if sw_new is not None and sw_new!=sw_old: targets.append((SW,sw_new.encode()))
    manifest=[]
    for path,data in targets:
        had_original=path.exists()
        if had_original: shutil.copy2(path,backup/(path.name+".original"))
        manifest.append({"path":str(path),"had_original":had_original,"bytes_new":len(data)})
    (backup/"manifest.json").write_text(json.dumps(manifest,indent=2))
    try:
        # Assets first, runtime entrypoint last, to avoid a broken live page.
        for path,data in targets[1:]: atomic_write(path,data)
        atomic_write(MAIN,targets[0][1])
    except Exception:
        for item in reversed(manifest):
            path=Path(item["path"]);saved=backup/(path.name+".original")
            if item["had_original"]:shutil.copy2(saved,path)
            else:path.unlink(missing_ok=True)
        raise
    # Check the actual HTTP paths used by the Android browser; a valid file
    # on disk is not evidence that the 8770 service serves that file.
    served={}
    for name,route,start in (
        ("model","/assets/travis/travis-michael-jackson-3d.glb?v=mj3d-2",b"glTF"),
        ("material","/travis-michael-jackson-3d.mjs?v=mj3d-2",b"/**"),
        ("interface","/travis-3d.mjs?v=continuous-2",b"import "),
    ):
        try:
            req=urllib.request.Request("http://127.0.0.1:8770"+route,
                headers={"Cache-Control":"no-store"})
            with urllib.request.urlopen(req,timeout=5) as response:
                head=response.read(24 if name!="interface" else 512)
                served[name]=response.status==200 and head.lstrip().startswith(start)
        except Exception as exc:
            served[name]=type(exc).__name__
    print("TRAVIS_MJ3D_HTTP="+json.dumps(served,sort_keys=True))
    print("TRAVIS_MJ3D_INSTALLED=true")
    print("TRAVIS_MJ3D="+json.dumps({"glb_bytes":size,"mesh_count":meshes,
        "photo_overlay_removed":"createMichaelJacksonHologram" in original,
        "local_backup":str(backup),"sw_updated":sw_old!=sw_new}))
    print("Fecha e reabre o Travis para ver o busto 3D. A voz e os comandos mantêm-se.")

if __name__=="__main__":
    try: main()
    except Exception as error:
        print("TRAVIS_MJ3D_INSTALLED=false; ERRO: "+str(error),file=sys.stderr)
        sys.exit(1)
