"""Static, no-network regression for the Travis MJ3D v4 Android installer."""
import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("mj3d_v4",root/"scripts/install-travis-mj3d-v4.py")
mj=importlib.util.module_from_spec(spec);spec.loader.exec_module(mj)
latest=(root/"travis-3d.mjs").read_text()
updated,changed=mj.patch(latest)
assert updated==latest and not changed, "Current master must stay unchanged"
assert not mj.patch(updated)[1], "Second install must be idempotent"

# A known older local MJ3D face variant has "asset" and a brittle catch block.
older=latest.replace(
 "import {styleMichaelJacksonHair, MJ3D_ASSET, loadMJ3DOrOriginal} from './travis-michael-jackson-3d.mjs?v=mj3d-4';",
 "import {styleMichaelJacksonHair, MJ3D_ASSET} from './travis-michael-jackson-3d.mjs?v=mj3d-2';"
).replace("loadMJ3DOrOriginal(new GLTFLoader(),asset)","new GLTFLoader().loadAsync(asset)")
assert older!=latest
fixed,changed=mj.patch(older)
assert changed
assert mj.IMPORT in fixed and "loadMJ3DOrOriginal(new GLTFLoader(),asset)" in fixed
assert "if(preferMJ) styleMichaelJacksonHair(" in fixed
assert mj.patch(fixed)==(fixed,False)

# Original native Blender bust variant; no MJ material and no photo layer.
original=(
 "import { createHolographicHeadMaterial } from './travis-holographic-head.mjs?v=sand-1';\n"
 "async function createFaceAvatar(){\n"
 " const gltf=await new GLTFLoader().loadAsync('./assets/travis/travis-face-bust.glb?v=1');\n"
 " const head=gltf.scene.getObjectByName('TravisFace_Bust');\n"
 " head.material=realFaceBaseMaterial;\n"
 " hud.dataset.faceAsset='bust';hud.dataset.avatarStyle='laser-hologram';\n"
 "}\n"
)
patched,changed=mj.patch(original)
assert changed and mj.IMPORT in patched
assert "loadMJ3DOrOriginal(new GLTFLoader(),MJ3D_ASSET)" in patched
assert "styleMichaelJacksonHair(THREE,realFaceModel,realFaceBaseMaterial.uniforms)" in patched
assert mj.patch(patched)==(patched,False)

# Old 2D photo display must be removed; the geometry remains a genuine GLB.
photo=original.replace(
 "import { createHolographicHeadMaterial }",
 "import {createMichaelJacksonHologram} from './travis-michael-jackson.mjs?v=mj-avatar-1';\n"
 "import { createHolographicHeadMaterial }",
).replace(
 "async function createFaceAvatar(){",
 "let michaelJacksonAvatar=null;\nasync function createFaceAvatar(){",
).replace(
 " hud.dataset.faceAsset='bust';",
 " void createMichaelJacksonHologram(THREE,realFaceModel,realFaceHead).then(avatar=>{\n"
 "  michaelJacksonAvatar=avatar;\n"
 " }).catch(error=>console.warn('Travis Michael Jackson portrait fallback:',error));\n"
 " hud.dataset.faceAsset='bust';",
)
fixed,changed=mj.patch(photo)
assert changed and "createMichaelJacksonHologram" not in fixed
assert "michaelJacksonAvatar" not in fixed
assert mj.patch(fixed)==(fixed,False)

# Unknown graphics fork: never overwrite it or guess a loader.
unknown=original.replace("new GLTFLoader().loadAsync(","customAssetLoader.loadAsync(")
try:
    mj.patch(unknown)
except RuntimeError as error:
    assert "Mantive a instalação" in str(error)
else:
    raise AssertionError("Unknown loader fork cannot be blindly patched")

html=(root/"index.html").read_text()
html2,changed=mj.update_index(html)
assert changed and "mj3d-repair=4" in html2 and mj.update_index(html2)==(html2,False)
sw=(root/"sw.js").read_text()
sw2,changed=mj.update_sw(sw)
assert "mj3d-r4" in sw2 and mj.update_sw(sw2)==(sw2,False)

asset=(root/"assets/travis/travis-michael-jackson-3d.glb").read_bytes()
p=mj.check_glb(asset)
assert p["bytes"]>1_000_000 and p["anchors"]==8
print("PASS MJ3D_V4: latest, older local variant, original, photo era, rejects unknown, repeated install, cache, licensed GLB")
