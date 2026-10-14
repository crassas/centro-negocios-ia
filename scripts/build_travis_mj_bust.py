#!/usr/bin/env python3
"""Travis · Michael Jackson 3D, derived from a textured, true volumetric head.

Build:
  blender -b -t 2 --python scripts/build_travis_mj_bust.py -- \
    assets/travis/travis-face-bust.glb assets/travis/travis-michael-jackson-3d.glb \
    /tmp/travis-mj-licensed.glb

No plane/billboard/photo overlays. The original Travis CC0 rig/eye anchors
remain in the GLB; the authentic CC-BY Michael Jackson geometry is the visible
hologram. Attribution: free-3d.fr / "Michael Jackson 3D Avatar Portait",
https://www.free-3d.fr/model/michael-jackson-3d-avatar-portait-50676,
Creative Commons BY 3.0 France, modifications: lower torso crop, transform,
retopology-free rig-compatible integration, holographic shader.
"""
import bpy,bmesh,sys,json,math
from pathlib import Path
from mathutils import Vector

argv=sys.argv
if "--" not in argv:raise RuntimeError("usage: -- original.glb output.glb authentic-mj.glb")
args=argv[argv.index("--")+1:]
if len(args)<3:raise RuntimeError("Authentic reference GLB is required; no generic fallback is acceptable")
original,output,licensed=(Path(x).resolve() for x in args[:3])
for p in (original,licensed):
    if not p.exists() or p.stat().st_size<100000:raise RuntimeError("Missing imported GLB "+str(p))
if original==output or licensed==output:raise RuntimeError("No in-place overwrites")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(original))
rig=bpy.data.objects.get("TravisFace_Bust")
if not rig or rig.type!="MESH":raise RuntimeError("No original CC0 rig mesh")
anchors={"TravisFace_Bust"}
for side in ("L","R"):
    for part in ("Eye","Iris","Pupil"):anchors.add("TravisFace_"+part+"_"+side)
if any(not bpy.data.objects.get(name) for name in anchors):
    raise RuntimeError("Existing original Travis eye/rig nodes incomplete")

# The licensed mesh has fully modeled cheeks, eyes, hair and jacket, in 3D.
# Import only it, retaining the original rig and its tested runtime names.
existing=set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(licensed))
new=[o for o in bpy.data.objects if o not in existing and o.type=="MESH"]
if len(new)!=1 or len(new[0].data.vertices)<6000:
    raise RuntimeError("Expected one authentic dense, textured Michael Jackson mesh")
avatar=new[0]
avatar.name="TravisMJ_Licensed_Head"
avatar.data.name="TravisMJ_MichaelJackson_ModelledFace"
if not avatar.data.uv_layers or not avatar.data.materials:
    raise RuntimeError("Licensed facial texture was not imported with its real 3D geometry")

# The source contains a jacket/shoulders that do not belong in the suspended
# head hologram; crop just below the natural upper neck.
# Source is Blender Z up, -Y forward; bounds measured in the workflow:
# X -.500..+.500, Y -.354..+.354, Z -.499..+.499.
world_verts=[avatar.matrix_world@v.co for v in avatar.data.vertices]
lo=Vector(tuple(min(v[i] for v in world_verts) for i in range(3)))
hi=Vector(tuple(max(v[i] for v in world_verts) for i in range(3)))
dims=hi-lo
if not(.8<dims.x<1.2 and .7<dims.z<1.2):
    raise RuntimeError("Authentic mesh dimensions are unexpected: "+str(tuple(dims)))
# Blender importer creates a no-transform mesh for this glb.
if avatar.matrix_world.determinant()<.0:
    raise RuntimeError("Unexpected flipped face handedness")
# Keep all visible head/hair, cut jacket from original coordinate z < -0.245.
cut_z=lo.z + dims.z*.255  # e.g. -.499+.255=-.244
bm=bmesh.new();bm.from_mesh(avatar.data)
geom=list(bm.verts)+list(bm.edges)+list(bm.faces)
# Incoming points are in model local; source is identity transform as tested.
if any(abs(v)>.01 for v in avatar.location) or any(abs(v-1.)>.01 for v in avatar.scale):
    bpy.context.view_layer.objects.active=avatar
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    bm.free();bm=bmesh.new();bm.from_mesh(avatar.data)
    geom=list(bm.verts)+list(bm.edges)+list(bm.faces)
bmesh.ops.bisect_plane(bm,geom=geom,dist=.00001,
    plane_co=(0,0,cut_z),plane_no=(0,0,1),clear_inner=True,clear_outer=False)
bm.to_mesh(avatar.data);bm.free();avatar.data.update()
if len(avatar.data.vertices)<6000:
    raise RuntimeError("Cropping destroyed facial geometry")

# Place face over the original Travis head in the SAME coordinate frame.
# Original frontal nose is y=-.55, eyes z=.65, crown z=1.14.
# New licensed front -Y => 3D positive Z after GLB Y-up export.
# Source volume remains a real mesh and rotates with the existing Travis root.
s=.92
avatar.scale=(s,s,s)
avatar.location=(.005,-.200,.675)
bpy.context.view_layer.objects.active=avatar
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
for poly in avatar.data.polygons:poly.use_smooth=True
# Do not bake / flatten UVs. Keep true textured 3D surface from CC-BY source.
tex=[material.name for material in avatar.data.materials]
if not tex:raise RuntimeError("Authentic source material lost")

# Preserve old hidden mesh for the original Travis lip rig (25k vertices).
# The visible model gets shader-driven audio articulation at runtime, so
# the old rig and eye pivots need not be discarded or rewritten.
output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(output),export_format="GLB",
    export_yup=True,export_apply=True,export_normals=True,
    export_materials="EXPORT",export_cameras=False,export_lights=False)
if not output.exists() or output.stat().st_size<500000:
    raise RuntimeError("Blender did not export the MJ licensed composite head")
blend=output.with_suffix(".blend")
bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
if not blend.exists() or blend.stat().st_size<200000:
    raise RuntimeError("No editable Blender scene")
print("TRAVIS_MJ3D_BUILD_OK",json.dumps({
    "asset":"Michael Jackson real textured 3D model, CC-BY 3.0 France",
    "source":str(licensed),"source_mesh_verts":len(new[0].data.vertices),
    "output":str(output),"bytes":output.stat().st_size,
    "blend_bytes":blend.stat().st_size,"faces":len(avatar.data.polygons),
    "name":avatar.name,"material":tex,"rig":sorted(anchors),
    "cut_z":cut_z,"model_translation":list(avatar.location),
    "model_dimensions":[round(d,3) for d in avatar.dimensions]
}),flush=True)
