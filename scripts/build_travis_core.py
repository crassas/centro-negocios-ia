import bpy
import math
from mathutils import Vector

OUT = "/root/repos/centro-negocios-ia/assets/travis/travis-core.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.unit_settings.system = 'METRIC'

def material(name, base, metallic=0.0, roughness=0.35, emission=None, strength=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*base, 1.0)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if 'Coat Weight' in bsdf.inputs:
        bsdf.inputs['Coat Weight'].default_value = 0.4 if metallic > 0.3 else 0.15
    if emission:
        if 'Emission Color' in bsdf.inputs:
            bsdf.inputs['Emission Color'].default_value = (*emission, 1.0)
        elif 'Emission' in bsdf.inputs:
            bsdf.inputs['Emission'].default_value = (*emission, 1.0)
        if 'Emission Strength' in bsdf.inputs:
            bsdf.inputs['Emission Strength'].default_value = strength
    if alpha < 1.0:
        bsdf.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'DITHERED'
    return m

METAL = material('MetalDark', (0.012, 0.025, 0.038), metallic=0.92, roughness=0.18)
METAL2 = material('MetalGraphite', (0.025, 0.048, 0.065), metallic=0.82, roughness=0.22)
CYAN = material('EmissiveCyan', (0.02, 0.22, 0.32), metallic=0.15, roughness=0.2,
                emission=(0.16, 0.92, 1.0), strength=6.0)
CYAN2 = material('EmissiveIce', (0.06, 0.32, 0.42), metallic=0.08, roughness=0.14,
                 emission=(0.55, 0.98, 1.0), strength=8.0)
RED = material('EmissiveRed', (0.2, 0.015, 0.035), metallic=0.15, roughness=0.18,
               emission=(1.0, 0.04, 0.16), strength=6.0)
GLASS = material('CoreGlass', (0.005, 0.045, 0.075), metallic=0.35, roughness=0.08)
ENERGY = material('CoreEnergy', (0.03, 0.2, 0.28), metallic=0.0, roughness=0.12,
                  emission=(0.2, 0.92, 1.0), strength=9.0)
WHITE = material('EmissiveWhite', (0.5, 0.8, 0.9), metallic=0.0, roughness=0.1,
                 emission=(0.9, 1.0, 1.0), strength=10.0)

def smooth(obj):
    if obj and obj.type == 'MESH':
        for p in obj.data.polygons:
            p.use_smooth = True

def empty(name, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    if parent:
        obj.parent = parent
    return obj

ROOT = empty('TRAVIS_CORE')

# Rear chassis discs
for i, (radius, z, mat) in enumerate([
    (2.95, -0.28, METAL),
    (2.55, -0.20, METAL2),
    (2.15, -0.12, METAL),
]):
    bpy.ops.mesh.primitive_torus_add(
        align='WORLD', major_radius=radius, minor_radius=0.055 + i*0.006,
        major_segments=96, minor_segments=8, location=(0,0,z)
    )
    o=bpy.context.object
    o.name=f'Chassis_{i}'
    o.data.materials.append(mat)
    o.parent=ROOT
    smooth(o)

def arc_strip(name, radius, width, depth, arcs, z, mat, parent, max_step_deg=5.0):
    verts=[]
    faces=[]
    for start_deg, end_deg in arcs:
        span=max(1.0,end_deg-start_deg)
        steps=max(2,int(math.ceil(span/max_step_deg)))
        base=len(verts)
        for s in range(steps+1):
            a=math.radians(start_deg + span*s/steps)
            ca,sa=math.cos(a),math.sin(a)
            inner=radius-width*0.5
            outer=radius+width*0.5
            verts.extend([
                (inner*ca, inner*sa, z-depth*0.5),
                (outer*ca, outer*sa, z-depth*0.5),
                (outer*ca, outer*sa, z+depth*0.5),
                (inner*ca, inner*sa, z+depth*0.5)
            ])
        for s in range(steps):
            a0=base+s*4
            a1=base+(s+1)*4
            faces.extend([
                (a0+3,a0+2,a1+2,a1+3),
                (a0,a1,a1+1,a0+1),
                (a0,a0+3,a1+3,a1),
                (a0+1,a1+1,a1+2,a0+2)
            ])
        faces.append((base,base+1,base+2,base+3))
        e=base+steps*4
        faces.append((e+3,e+2,e+1,e))
    mesh=bpy.data.meshes.new(name+'Mesh')
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    obj.parent=parent
    return obj

def arcs_for(count, segment_deg, offset=0.0, skip_mod=None):
    step=360.0/count
    out=[]
    for i in range(count):
        if skip_mod and i % skip_mod == 0:
            continue
        center=offset+i*step
        out.append((center-segment_deg*0.5, center+segment_deg*0.5))
    return out

rotor_specs=[
    (1.18, 14, 12.5, 0.03, (3.0,-2.0,0.0)),
    (1.48, 16, 10.5, 0.08, (-4.0,2.5,0.0)),
    (1.78, 20, 8.5, 0.12, (5.5,1.5,0.0)),
    (2.10, 24, 7.0, 0.16, (-3.5,-4.0,0.0)),
    (2.43, 28, 6.0, 0.20, (4.0,-2.0,0.0)),
    (2.72, 32, 5.2, 0.24, (-2.0,3.0,0.0)),
]
for idx,(radius,count,seg,z,tilt) in enumerate(rotor_specs):
    g=empty(f'Rotor_{idx}',ROOT)
    g.rotation_euler=[math.radians(x) for x in tilt]
    # dark physical ring
    bpy.ops.mesh.primitive_torus_add(
        align='WORLD', major_radius=radius, minor_radius=0.025 if idx<3 else 0.032,
        major_segments=96, minor_segments=6, location=(0,0,z-0.022)
    )
    base=bpy.context.object
    base.name=f'RotorBase_{idx}'
    base.data.materials.append(METAL2 if idx%2 else METAL)
    base.parent=g
    smooth(base)

    all_arcs=arcs_for(count,seg,offset=(idx*11.0))
    cyan_arcs=[a for i,a in enumerate(all_arcs) if i%5 not in (1,4)]
    red_arcs=[a for i,a in enumerate(all_arcs) if i%5 in (1,4)]
    arc_strip(f'RotorCyan_{idx}',radius,0.105 if idx<3 else 0.13,0.045,cyan_arcs,z,CYAN2 if idx<2 else CYAN,g)
    arc_strip(f'RotorRed_{idx}',radius,0.11 if idx<3 else 0.14,0.05,red_arcs,z+0.006,RED,g)

# Fine outer tick ring
outer=empty('Rotor_Ticks',ROOT)
tick_arcs=arcs_for(44,2.4,offset=4.0)
arc_strip('OuterTicks',3.04,0.055,0.035,tick_arcs,0.14,CYAN,outer,max_step_deg=2.0)

# Mechanical radial fins
fins=empty('MechanicalFins',ROOT)
for i in range(12):
    a=math.radians(i*30+15)
    r=2.88
    x,y=r*math.cos(a),r*math.sin(a)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x,y,-0.03), rotation=(0,0,a))
    o=bpy.context.object
    o.name=f'Fin_{i:02d}'
    o.scale=(0.34,0.055,0.055)
    o.data.materials.append(METAL if i%2 else METAL2)
    o.parent=fins
    bevel=o.modifiers.new('MicroBevel','BEVEL')
    bevel.width=0.035
    bevel.segments=2

# Core glass and energy
bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=0.94, location=(0,0,0.12))
glass=bpy.context.object
glass.name='CoreGlassSphere'
glass.data.materials.append(GLASS)
glass.parent=ROOT
smooth(glass)

bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=20, radius=0.56, location=(0,0,0.12))
energy=bpy.context.object
energy.name='CoreEnergySphere'
energy.data.materials.append(ENERGY)
energy.parent=ROOT
smooth(energy)

# Inner metallic iris rings
for i,(r,z) in enumerate([(0.78,0.10),(0.67,0.18),(0.60,0.24)]):
    bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=0.028, major_segments=72, minor_segments=6, location=(0,0,z))
    o=bpy.context.object
    o.name=f'Iris_{i}'
    o.data.materials.append(METAL2)
    o.parent=ROOT
    smooth(o)

# Emissive triangular emblem built from 3 bars
emblem=empty('Emblem',ROOT)
tri=[Vector((0,0.50,0.94)),Vector((-0.43,-0.28,0.94)),Vector((0.43,-0.28,0.94))]
def bar_between(name,p1,p2,width=0.065,depth=0.045):
    mid=(p1+p2)*0.5
    vec=p2-p1
    length=vec.length
    bpy.ops.mesh.primitive_cube_add(size=1,location=mid)
    o=bpy.context.object
    o.name=name
    o.scale=(length*0.5,width,depth)
    o.rotation_euler[2]=math.atan2(vec.y,vec.x)
    o.data.materials.append(WHITE)
    o.parent=emblem
    bevel=o.modifiers.new('Bevel','BEVEL');bevel.width=0.035;bevel.segments=3
    return o
bar_between('Emblem_A',tri[0],tri[1])
bar_between('Emblem_B',tri[1],tri[2])
bar_between('Emblem_C',tri[2],tri[0])

# Small forward lens cap
bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.23, location=(0,0,0.80))
cap=bpy.context.object
cap.name='EnergyLens'
cap.scale=(1,1,0.25)
cap.data.materials.append(CYAN2)
cap.parent=ROOT
smooth(cap)

# Orientation helper / subtle back plate
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=3.18, depth=0.04, location=(0,0,-0.36))
plate=bpy.context.object
plate.name='BackPlate'
plate.data.materials.append(METAL)
plate.parent=ROOT
bevel=plate.modifiers.new('Bevel','BEVEL');bevel.width=0.035;bevel.segments=2

# Apply scale modifiers where useful
for obj in list(bpy.context.scene.objects):
    if obj.type=='MESH':
        try:
            bpy.context.view_layer.objects.active=obj
            obj.select_set(True)
            bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
            obj.select_set(False)
        except:
            pass

# Export selected hierarchy
for o in bpy.context.scene.objects:
    o.select_set(True)

bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    export_apply=True,
    export_texcoords=False,
    export_normals=True,
    export_materials='EXPORT',
    export_cameras=False,
    export_lights=False,
    export_yup=False
)

print("TRAVIS_GLTF_OK", OUT)
