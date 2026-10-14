#!/usr/bin/env python3
"""Blender 4+/5+: sculpt a volumetric Michael Jackson-inspired BAD-era head
from the existing CC0 Travis anatomical bust. Keeps exact face/eye object names,
coordinate system and editable mouth topology for the existing Three.js rig.

blender -b -t 2 --python scripts/build_travis_mj_bust.py -- \
 assets/travis/travis-face-bust.glb assets/travis/travis-michael-jackson-3d.glb
"""
import bpy
import json
import math
import random
import sys
from pathlib import Path
from mathutils import Vector

argv=sys.argv
if '--' not in argv or len(argv[argv.index('--')+1:]) < 2:
    raise SystemExit('Expected -- input.glb output.glb')
source, dest=[Path(p).resolve() for p in argv[argv.index('--')+1:][:2]]
if not source.is_file() or source.stat().st_size < 100000:
    raise RuntimeError('Source bust missing or too small: '+str(source))
if source == dest:
    raise RuntimeError('Refusing to overwrite anatomical source')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
head=bpy.data.objects.get('TravisFace_Bust')
if not head or head.type!='MESH' or not head.data.vertices:
    raise RuntimeError('Cannot find original Blender bust: TravisFace_Bust')
for side in ('L','R'):
    for label in ('Eye','Iris','Pupil'):
        if not bpy.data.objects.get('TravisFace_'+label+'_'+side):
            raise RuntimeError('Missing original animation anchor '+label+'_'+side)

rng=random.Random(1958)
clamp=lambda x,lo=0.,hi=1.: max(lo,min(hi,x))
gauss=lambda x,s: math.exp(-.5*(x/s)**2)
verts=head.data.vertices
orig=[v.co.copy() for v in verts]
xmin=min(v.x for v in orig); xmax=max(v.x for v in orig)
zmin=min(v.z for v in orig); zmax=max(v.z for v in orig)
frontset=[v.y for v in orig if abs(v.x)<.17 and .68<v.z<.90]
if not frontset:
    raise RuntimeError('Anatomical bust landmarks could not be resolved.')
forehead_y=min(frontset)
back_y=max(v.y for v in orig if v.z>.58)
head_rx=max(abs(xmin),abs(xmax))
if not (0.20 < head_rx < 1.0 and zmax>.8 and -1.25<forehead_y<.0):
    raise RuntimeError('Unexpected coordinate frame, not sculpting this bust: '+str((xmin,xmax,zmax,forehead_y)))

# Native *Blender* coordinates: x horizontal, -y towards the camera, z vertical.
# Localized, smooth sculpt only on the frontal facial surface. We keep the eyes,
# jaw, lips and mesh topology intact so the original Travis viseme rig still works.
for v,p in zip(verts,orig):
    x,y,z=p.x,p.y,p.z
    face=clamp((-y-.14)/.29)
    face*=clamp((z-.16)/.18)
    upper=gauss(z-.75,.33)
    lower=clamp((.59-z)/.35)
    # Michael's elongated slender oval and finer lower jaw.
    jaw=gauss(z-.33,.23)*face
    nx=x*(1.-.065*jaw-.055*lower*face)
    # Cheekbone definition and shallow submalar hollows.
    zygo=gauss(abs(x)-.185,.075)*gauss(z-.54,.088)*face
    hollow=gauss(abs(x)-.17,.076)*gauss(z-.405,.068)*face
    dy=-.024*zygo+.013*hollow
    # Slimmer narrow bridge, delicate tipped nose; avoid destroying nostril holes.
    bridge=gauss(x,.069)*gauss(z-.51,.12)*clamp((-y-.39)/.11)
    nx*=(1.-.105*bridge)
    dy-=.022*gauss(x,.055)*gauss(z-.47,.058)*clamp((-y-.37)/.13)
    # Distinctive raised outer brow and narrower refined chin.
    brow=gauss(abs(x)-.16,.069)*gauss(z-.713,.032)*face
    dy-=.008*brow
    chin=gauss(x,.105)*gauss(z-.235,.055)*face
    dy-=.014*chin
    # Facial volume moves along camera-facing normal (negative Blender y).
    v.co.x=nx
    v.co.y=y+dy
head.data.update()
for polygon in head.data.polygons:
    polygon.use_smooth=True

# Controlled elliptical, asymmetric scalp volume. The cap and every lock below
# are true 3D meshes, not billboards, images, or a photo texture.
scalp_cx=(xmin+xmax)*.5
scalp_front=forehead_y-.014
scalp_back=back_y+.014
scalp_cy=(scalp_front+scalp_back)*.5
rx=max(.27,min(.50,head_rx*1.04))
ry=clamp((scalp_back-scalp_front)*.54,.26,.52)
cz=zmax-.435
rz=.478
lat_count=35; az_count=104
cap_points=[];cap_faces=[]
for ring in range(lat_count+1):
    t=ring/lat_count
    for k in range(az_count):
        a=2*math.pi*k/az_count
        # -Y is front. Scalp grows past ears and over the nape.
        frontness=(1-math.sin(a))*.5
        max_lat=(1.76-.44*frontness+.27*(1-frontness))
        theta=t*max_lat
        bump=.015*math.sin(a*7.+theta*8.)*math.sin(theta*3.)
        x=scalp_cx+(rx+bump)*math.sin(theta)*math.cos(a)
        y=scalp_cy+(ry+bump)*math.sin(theta)*math.sin(a)
        z=cz+(rz+bump)*math.cos(theta)
        cap_points.append((x,y,z))
for ring in range(lat_count):
    for k in range(az_count):
        a=ring*az_count+k;b=ring*az_count+(k+1)%az_count
        c=(ring+1)*az_count+(k+1)%az_count;d=(ring+1)*az_count+k
        cap_faces.append((a,b,c,d))

def mesh_object(name,points,faces):
    mesh=bpy.data.meshes.new(name+'_Mesh')
    mesh.from_pydata(points,[],faces);mesh.update(calc_edges=True)
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    for polygon in mesh.polygons:polygon.use_smooth=True
    return obj

def plain_material(name,color,rough=.45):
    material=bpy.data.materials.new(name)
    material.use_nodes=True
    material.diffuse_color=(*color,1.)
    bsdf=material.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value=(*color,1.)
        bsdf.inputs['Roughness'].default_value=rough
    return material

hair_base=mesh_object('TravisMJ_HairBase',cap_points,cap_faces)
hair_base.data.materials.append(plain_material('TravisMJ_SatinBlueBlack',(.019,.028,.039),.37))

# Spiral strands with five-sided tapered volume and a real circular cross section.
# Combining all curls into ONE mesh minimizes GL draw calls on Android.
strand_vertices=[];strand_faces=[];strand_counter=0

def strand(points,radius=.0085,sides=5):
    global strand_counter
    if len(points)<3:return
    base=len(strand_vertices)
    for j,q in enumerate(points):
        t=j/(len(points)-1)
        d=(points[min(len(points)-1,j+1)]-points[max(0,j-1)]).normalized()
        side=d.cross(Vector((0,1,0)))
        if side.length<.001:side=d.cross(Vector((1,0,0)))
        side.normalize();normal=d.cross(side).normalized()
        thick=radius*(.14+.86*math.sin(math.pi*(.08+.85*t))**.68)*(1.-.45*t)
        for k in range(sides):
            angle=2*math.pi*k/sides
            p=q+thick*(math.cos(angle)*side+math.sin(angle)*normal)
            strand_vertices.append(tuple(p))
    for j in range(len(points)-1):
        for k in range(sides):
            a=base+j*sides+k;b=base+j*sides+(k+1)%sides
            c=base+(j+1)*sides+(k+1)%sides;d=base+(j+1)*sides+k
            strand_faces.append((a,b,c,d))
    strand_counter+=1

def hair_lock(x,y,z,L=0.35,r=.0075,seed=0.0,lean=0.0):
    turns=rng.uniform(1.35,3.2);phase=rng.uniform(-math.pi,math.pi)
    step_count=15
    points=[]
    for i in range(step_count):
        t=i/(step_count-1)
        sway=math.sin(phase+2*math.pi*turns*t)
        coil=rng.uniform(.010,.019)
        # Spiral travels in XYZ; curvature visible in the profile.
        px=x+lean*t+.010*sway
        py=y+(coil*math.cos(phase+2*math.pi*turns*t))+.009*t
        pz=z-L*t+.008*sway
        points.append(Vector((px,py,pz)))
    strand(points,r,sides=5)

# Subtle short crown flyaways for micro silhouette and authentic curls.
for i in range(55):
    a=rng.random()*2*math.pi
    polar=rng.uniform(.15,.94)
    x=scalp_cx+rx*math.sin(polar)*math.cos(a)
    y=scalp_cy+ry*math.sin(polar)*math.sin(a)
    z=cz+rz*math.cos(polar)
    hair_lock(x,y,z,rng.uniform(.075,.17),rng.uniform(.004,.007),lean=rng.uniform(-.07,.07))

# Forehead ringlets: layered, off-centre and separated so both eyes remain visible.
for i in range(54):
    x=rng.uniform(-.245,.235)
    x+=-.024*(i%3==0)
    y=scalp_front-rng.uniform(.006,.027)
    z=cz+rz*rng.uniform(.82,1.0)
    length=rng.uniform(.12,.25)
    hair_lock(x,y,z,length,rng.uniform(.004,.008),lean=rng.uniform(-.04,.035))

# Cascading curls on both sides of the face, past the ears, never a rectangular cape.
for side in (-1,1):
    for i in range(62):
        x=side*rng.uniform(rx*.79,rx*1.09)
        y=rng.uniform(scalp_front+.03,scalp_back-.05)
        z=rng.uniform(zmax-.35,zmax-.07)
        length=rng.uniform(.21,.59)
        hair_lock(x,y,z,length,rng.uniform(.0045,.0082),lean=side*rng.uniform(.008,.060))

# Backside depth: the camera sees real mesh volume when the head turns.
for i in range(51):
    a=rng.uniform(.1*math.pi,.9*math.pi)
    x=rx*rng.uniform(.66,1.02)*math.cos(a)
    y=scalp_cy+ry*rng.uniform(.8,1.02)*math.sin(a)
    z=rng.uniform(zmax-.32,zmax-.06)
    hair_lock(x,y,z,rng.uniform(.25,.65),rng.uniform(.005,.009),lean=rng.uniform(-.05,.05))

curls=mesh_object('TravisMJ_Curls',strand_vertices,strand_faces)
curls.data.materials.append(plain_material('TravisMJ_DarkCurlyHair',(.018,.026,.035),.32))

# Export native glTF Y-up, so Three.js sees the exact original x/y/z coordinate convention.
# Existing core runtime locates TravisFace_Bust, Eye/ Iris/ Pupil meshes by name.
dest.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',export_yup=True,export_apply=True,
    export_normals=True,export_materials='EXPORT',export_cameras=False,export_lights=False)
if not dest.exists() or dest.stat().st_size<150000:
    raise RuntimeError('GLB export is invalid.')
print('TRAVIS_MJ3D_BUILD_OK',json.dumps({
  'source':str(source),'output':str(dest),'bytes':dest.stat().st_size,
  'anatomy_vertices':len(head.data.vertices),
  'hair_strands':strand_counter,'hair_vertices':len(strand_vertices),
  'hair_triangles':2*len(strand_faces),'scalp_triangles':2*len(cap_faces),
  'bounds':{'xmin':xmin,'xmax':xmax,'zmax':zmax,'forehead_y':forehead_y},
  'meshes':[o.name for o in bpy.context.scene.objects if o.type=='MESH']
}),flush=True)
