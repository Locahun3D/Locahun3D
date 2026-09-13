"""Render owned vehicle assets from three directions and update menu previews."""
import bpy
from pathlib import Path
from mathutils import Vector

root = Path(__file__).resolve().parents[1]
assets = root / 'src/assets/equipment'
output = root / 'docs/vehicle-review'
output.mkdir(parents=True, exist_ok=True)
for name in ['hiace', 'truck2t', 'truck4t']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(assets / (name + '.glb')))
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 8
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 4
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = True
    scene.view_settings.view_transform = 'Standard'
    corners = [o.matrix_world @ Vector(p) for o in scene.objects if o.type == 'MESH' for p in o.bound_box]
    center = Vector(tuple((min(p[i] for p in corners) + max(p[i] for p in corners)) / 2 for i in range(3)))
    data = bpy.data.cameras.new('Review')
    camera = bpy.data.objects.new('Review', data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    data.type = 'ORTHO'
    for view, direction in [('three-quarter', (8,-11,6)), ('front',(0,-12,0)), ('side',(12,0,0)), ('thumbnail',(8,-11,6))]:
        w,h = (400,260) if view == 'thumbnail' else (1000,650)
        scene.render.resolution_x,scene.render.resolution_y = w,h
        scene.render.resolution_percentage = 100
        camera.location = center + Vector(direction)
        camera.rotation_euler = (center-camera.location).to_track_quat('-Z','Y').to_euler()
        bpy.context.view_layer.update()
        points = [camera.matrix_world.inverted() @ p for p in corners]
        width = max(p.x for p in points)-min(p.x for p in points)
        height = max(p.y for p in points)-min(p.y for p in points)
        offset = Vector(((max(p.x for p in points)+min(p.x for p in points))/2,(max(p.y for p in points)+min(p.y for p in points))/2,0))
        camera.location += camera.rotation_euler.to_matrix() @ offset
        data.ortho_scale = max(width,height*w/h)*1.18
        scene.render.filepath = str(assets/(name+'.png') if view=='thumbnail' else output/(name+'-'+view+'.png'))
        bpy.ops.render.render(write_still=True)
        print('VEHICLE_REVIEW',name,view,flush=True)
