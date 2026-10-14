#!/usr/bin/env python3
"""Render genuine 3D front and three-quarter verification frames from .blend.

Usage: blender -b NAME.blend -t 2 --python scripts/render_travis_mj3d_preview.py -- OUT_DIR
The preview is for QA only: the runtime uses the GLB, not these images.
"""
import bpy, math, sys, json
from pathlib import Path
from mathutils import Vector
if '--' not in sys.argv: raise SystemExit('Pass -- output-directory')
dest=Path(sys.argv[sys.argv.index('--')+1]).resolve();dest.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.device='CPU'
scene.cycles.samples=12
scene.render.resolution_x=560
scene.render.resolution_y=700
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGB'
scene.render.film_transparent=False
scene.view_settings.view_transform='AgX'
world=bpy.data.worlds.new('MJ3D Preview Dark Studio')
world.use_nodes=True
background=world.node_tree.nodes.get('Background')
background.inputs['Color'].default_value=(.018,.022,.034,1.)
background.inputs['Strength'].default_value=.7
scene.world=world

def area(name,location,power,size,color):
    bpy.ops.object.light_add(type='AREA',location=location)
    light=bpy.context.object;light.name=name
    light.data.energy=power
    light.data.shape='DISK'
    light.data.size=size
    light.data.color=color
    return light

area('SoftboxLeft',(-1.2,-2.0,1.9),280,2.1,(.84,.91,1.0))
area('WarmRim',(1.2,.4,1.45),230,1.4,(1.0,.78,.49))
area('FaceFill',(1.0,-1.9,.7),160,2.3,(.75,.86,1.0))
bpy.ops.object.camera_add(location=(0,-3,.63))
camera=bpy.context.object;camera.name='TRAVIS_MJ3D_QA_CAMERA'
camera.data.type='ORTHO'
camera.data.ortho_scale=1.85
scene.camera=camera

outputs={}
for name,position in [('front',(0,-3.0,.63)),('three-quarter',(1.75,-3.0,.68))]:
    camera.location=position
    direction=Vector((0,-.06,.57))-camera.location
    camera.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
    path=dest/('travis-mj3d-preview-'+name+'.png')
    scene.render.filepath=str(path)
    bpy.ops.render.render(write_still=True)
    if not path.exists() or path.stat().st_size<3000:raise RuntimeError('Missing QA render '+name)
    outputs[name]={'file':str(path),'bytes':path.stat().st_size}
print('TRAVIS_MJ3D_PREVIEW_OK',json.dumps(outputs),flush=True)
