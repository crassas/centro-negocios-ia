"""Refine the existing Blender Human Base Meshes bust; no procedural replacement anatomy.
Usage: blender -b -t 2 --python scripts/prepare_travis_bust.py -- source.glb output.glb
"""
import bpy, bmesh, sys, math, json
from pathlib import Path
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:]
source,output=map(Path,args[:2])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
body=bpy.data.objects.get('TravisFace_Bust')
assert body and body.type=='MESH', 'Anatomical bust missing'
# A flat cut below the clavicles removes the unfinished torso without inventing a neck.
bm=bmesh.new();bm.from_mesh(body.data)
geom=list(bm.verts)+list(bm.edges)+list(bm.faces)
cut=bmesh.ops.bisect_plane(bm,geom=geom,dist=0.00001,plane_co=(0,0,-.48),plane_no=(0,0,1),clear_inner=True)
boundary=[e for e in cut['geom_cut'] if isinstance(e,bmesh.types.BMEdge) and e.is_boundary]
if boundary:bmesh.ops.holes_fill(bm,edges=boundary,sides=0)
bm.to_mesh(body.data);bm.free();body.data.update()
modifier=body.modifiers.new('Anatomical surface refinement','SUBSURF');modifier.levels=1
bpy.context.view_layer.objects.active=body;bpy.ops.object.modifier_apply(modifier=modifier.name)
for polygon in body.data.polygons:polygon.use_smooth=True
def material(name,color,roughness):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
 p.inputs['Roughness'].default_value=roughness;p.inputs['Metallic'].default_value=.04
 return m
def cap(name,center,radius,angle,color,offset=0):
 vertices=[(center.x,center.y-radius-offset,center.z)]
 rings=6;segments=48
 for ring in range(1,rings+1):
  theta=angle*ring/rings
  for i in range(segments):
   a=i/segments*math.tau;r=radius+offset
   vertices.append((center.x+r*math.sin(theta)*math.cos(a),center.y-r*math.cos(theta),center.z+r*math.sin(theta)*math.sin(a)))
 faces=[]
 for i in range(segments):faces.append((0,1+i,1+(i+1)%segments))
 for ring in range(rings-1):
  a=1+ring*segments;b=a+segments
  for i in range(segments):j=(i+1)%segments;faces.append((a+i,b+i,b+j,a+j))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
 obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
 obj.data.materials.append(material(name+'_Material',color,.27))
 for polygon in mesh.polygons:polygon.use_smooth=True
 return obj
for label in ['L','R']:
 eye=bpy.data.objects['TravisFace_Eye_'+label]
 coords=[eye.matrix_world@v.co for v in eye.data.vertices]
 low=Vector(tuple(min(v[i] for v in coords) for i in range(3)))
 high=Vector(tuple(max(v[i] for v in coords) for i in range(3)))
 center=(low+high)/2;radius=(high-low).x/2
 cap('TravisFace_Iris_'+label,center,radius,.44,(.035,.18,.23),.00045)
 cap('TravisFace_Pupil_'+label,center,radius,.18,(.001,.003,.005),.0008)
 for polygon in eye.data.polygons:polygon.use_smooth=True
output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_yup=True,export_apply=True)
print('TRAVIS_BUST_EXPORT',json.dumps({'source':str(source),'output':str(output),'bytes':output.stat().st_size,'meshes':[o.name for o in bpy.context.scene.objects if o.type=='MESH']}),flush=True)
