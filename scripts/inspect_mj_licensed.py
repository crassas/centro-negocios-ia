"""Inspect the CC BY 3.0 FR MJ avatar from free-3d.fr before rig retargeting."""
import bpy,sys,json
from pathlib import Path
from mathutils import Vector
filename=Path(sys.argv[sys.argv.index('--')+1]).resolve()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(filename))
mesh_objects=[o for o in bpy.data.objects if o.type=='MESH']
info=[]
for o in mesh_objects:
    world=[o.matrix_world@Vector(x) for x in o.bound_box]
    bounds=[[round(min(v[i] for v in world),4),round(max(v[i] for v in world),4)] for i in range(3)]
    info.append({'name':o.name,'type':o.type,'vertices':len(o.data.vertices),
        'polygons':len(o.data.polygons),'dimensions':[round(x,4) for x in o.dimensions],
        'bounds_world_xyz':bounds,
        'material_names':[m.name for m in o.data.materials],
        'shape_keys':list(o.data.shape_keys.key_blocks.keys())[:15] if o.data.shape_keys else [],
        'loc':[round(x,4) for x in o.location],
        'rotation':[round(x,4) for x in o.rotation_euler]})
print('MJ_LICENSED_GLTF_DIAGNOSTICS',json.dumps({
 'file':str(filename),'meshes':info,'other_nodes':[(o.name,o.type) for o in bpy.data.objects if o.type!='MESH'],
 'scene_world_bounds':[[
    round(min((o.matrix_world@Vector(v))[i] for o in mesh_objects for v in o.bound_box),4),
    round(max((o.matrix_world@Vector(v))[i] for o in mesh_objects for v in o.bound_box),4)
 ] for i in range(3)]}),flush=True)
