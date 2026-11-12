"""The fish-market vendors: three people with their own build, hat, skin, apron and hair.

Facing -Y in Blender (which is -Z in the game after the glTF export, out to sea over the pier).
About 1.7 m tall, roughly six and a half heads, with a slightly bigger head to read friendly.
The result is two meshes: `vendor_body` (everything) and `arm_wave` (the right arm, a node
pivoted at the shoulder so the game can wave it).
"""
import math
import bpy
import lib
from lib import PAL, mat

# One row per market (ids match src/ocean/market.ts). Indices point into PAL.vendor.
VENDORS = {
    "hai-dang": dict(hat="straw", skin=0, apron=0, hair=0, hair_style="bun", build=1.00, height=1.00, moustache=False),
    "doi-xanh": dict(hat="cap", skin=1, apron=1, hair=1, hair_style="short", build=1.12, height=1.04, moustache=True),
    "bai-co": dict(hat="scarf", skin=2, apron=2, hair=2, hair_style="bun", build=0.94, height=0.94, moustache=False),
}


def build(spec, low):
    V = PAL["vendor"]
    P = PAL["person"]
    skin_h = V["skin"][spec["skin"]]
    SKIN = mat("skin", skin_h, 0.5)
    SHIRT = mat("shirt", P["shirt"], 0.85)
    APRON = mat("apron", V["apron"][spec["apron"]], 0.75)
    TROUS = mat("trousers", PAL["crew"]["trousers"], 0.85)
    BOOT = mat("boots", PAL["fit"]["boots"], 0.55)
    HAIR = mat("hair", V["hair"][spec["hair"]], 0.55)
    DARK = mat("eye", P["eye"], 0.3)
    WHITE = mat("eyewhite", P["eyeWhite"], 0.3)
    LIP = mat("lip", P["lip"], 0.45)
    BLUSH = mat("blush", P["blush"], 0.6)
    BAND = mat("band", P["band"], 0.7)
    POCKET = mat("pocket", P["pocket"], 0.75)
    HAT = mat("hat", V["hat"][spec["hat"]], 0.9)

    b = lib.Build(low)
    k = spec["build"]  # body thickness
    made = []          # (object) joined into the body
    wave = []          # objects of the waving arm

    def mk(o, keep=False):
        made.append(o)
        if keep:
            b.keep.append(o)
        return o

    # ---- legs and boots ----------------------------------------------------------------
    for s in (-1, 1):
        mk(b.limb("leg", [(s*0.095, 0, 0.99, 0.112*k, 0.115*k), (s*0.100, -0.005, 0.74, 0.098*k, 0.100*k),
                          (s*0.100, -0.01, 0.50, 0.074*k, 0.078*k), (s*0.098, 0, 0.30, 0.068, 0.072),
                          (s*0.098, 0, 0.12, 0.058, 0.060)], TROUS))
        mk(b.ball(0.075, (s*0.09, -0.045, 0.055), BOOT, (0.95, 2.0, 0.80)))
        mk(b.ball(0.062, (s*0.09, 0, 0.14), BOOT, (1, 1, 1.5)))

    # ---- torso (shirt), neck ------------------------------------------------------------
    mk(b.limb("torso", [(0, 0, 0.97, 0.185*k, 0.118*k), (0, 0, 1.07, 0.158*k, 0.102*k), (0, 0, 1.21, 0.178*k, 0.112*k),
                        (0, 0, 1.34, 0.200*k, 0.116*k), (0, 0, 1.43, 0.205*k, 0.104*k), (0, 0.004, 1.50, 0.105, 0.085)], SHIRT))
    mk(b.limb("neck", [(0, 0.01, 1.44, 0.058, 0.060), (0, 0.012, 1.58, 0.050, 0.052)], SKIN))

    # ---- head: a skull with a tapered jaw -----------------------------------------------
    HZ = 1.67
    first = len(bpy.data.objects)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=16 if low else 40, ring_count=10 if low else 28)
    hd = bpy.context.object
    import bmesh
    bm = bmesh.new(); bm.from_mesh(hd.data)
    for v in bm.verts:
        x, y, z = v.co
        px, py, pz = x*0.080, y*0.098, z*0.120
        if pz < 0:
            t = min(1.0, -pz/0.120)
            px *= 1 - 0.24*t**1.4
            py *= 1 - 0.22*t**1.6
            py -= 0.012*t**2
        v.co = (px, py, pz + HZ)
    bm.to_mesh(hd.data); bm.free()
    hd.data.materials.append(SKIN); b.smooth(hd); mk(hd, keep=True)
    for s in (-1, 1):
        mk(b.ball(0.028, (s*0.080, 0.005, HZ-0.01), SKIN, (0.35, 0.7, 1.0)), keep=True)
        mk(b.ball(0.015, (s*0.037, -0.087, HZ+0.012), WHITE, (1, 0.55, 0.8)), keep=True)
        mk(b.ball(0.0105, (s*0.037, -0.0965, HZ+0.011), DARK, (1, 0.5, 1)), keep=True)
        mk(b.ball(0.0185, (s*0.037, -0.0865, HZ+0.021), SKIN, (1.05, 0.62, 0.38)), keep=True)
        mk(b.box((0.028, 0.008, 0.0055), (s*0.040, -0.088, HZ+0.045), HAIR,
                 rot=(math.radians(10), math.radians(-s*8), math.radians(s*-9)), keep=True))
        mk(b.ball(0.022, (s*0.052, -0.071, HZ-0.038), BLUSH, (1.0, 0.16, 0.7)), keep=True)
        mk(b.ball(0.009, (s*0.014, -0.098, HZ-0.036), SKIN, (1, 0.9, 0.9)), keep=True)
    mk(b.ball(0.012, (0, -0.093, HZ-0.005), SKIN, (0.8, 1.3, 2.0), rot=(math.radians(-15), 0, 0)), keep=True)
    mk(b.ball(0.016, (0, -0.1055, HZ-0.032), SKIN, (1.0, 0.95, 0.85)), keep=True)
    mk(b.ball(0.016, (0, -0.0935, HZ-0.067), LIP, (1.5, 0.5, 0.40)), keep=True)
    mk(b.ball(0.0175, (0, -0.092, HZ-0.0755), LIP, (1.4, 0.5, 0.45)), keep=True)
    if spec["moustache"]:
        for s in (-1, 1):
            mk(b.ball(0.02, (s*0.017, -0.1, HZ-0.056), HAIR, (1.5, 0.5, 0.55)), keep=True)

    # ---- hair and headwear --------------------------------------------------------------
    mk(b.ball(0.095, (0, 0.012, HZ+0.025), HAIR, (0.88, 1.0, 1.05)))
    if spec["hair_style"] == "bun":
        mk(b.ball(0.045, (0, 0.092, HZ+0.045), HAIR))
    if spec["hat"] == "straw":    # the non la
        prof = [(0.40, 0.0), (0.36, 0.014), (0.29, 0.046), (0.21, 0.093), (0.128, 0.150), (0.055, 0.197), (0.0, 0.222)]
        seg = 12 if low else 40
        rows = [[(math.cos(2*math.pi*i/seg)*r, math.sin(2*math.pi*i/seg)*r + 0.0, z + HZ + 0.06) for i in range(seg+1)] for r, z in prof]
        mk(b.shell("hat", rows, HAT, thickness=0.006, offset=-1, subd=1))
        mk(b.torus(0.248, 0.006, (0, 0, HZ+0.13), BAND))
    elif spec["hat"] == "cap":    # a flat cap with a short peak
        mk(b.ball(0.098, (0, 0.006, HZ+0.05), HAT, (1.04, 1.12, 0.62)))
        mk(b.ball(0.07, (0, -0.10, HZ+0.03), HAT, (1.35, 1.05, 0.12)))
        mk(b.torus(0.09, 0.006, (0, 0.004, HZ+0.035), BAND, scale=(1.02, 1.12, 1)))
    else:                          # a knotted head scarf
        mk(b.ball(0.106, (0, 0.01, HZ+0.05), HAT, (1.0, 1.04, 0.78)))
        mk(b.ball(0.03, (0.07, -0.05, HZ+0.075), HAT, (1.2, 1.0, 0.8)))
        mk(b.ball(0.022, (-0.07, -0.05, HZ+0.075), HAT, (1.2, 1.0, 0.8)))

    # the head (face, hair, headwear) a touch bigger than life: friendlier
    head_objs = [o for o in list(bpy.data.objects)[first:] if o.type == "MESH" and o in made]
    bpy.ops.object.empty_add(location=(0, 0.005, 1.56))
    piv = bpy.context.object
    piv.scale = (1.14, 1.14, 1.14)
    bpy.context.view_layer.update()
    for o in head_objs:
        o.parent = piv; o.matrix_parent_inverse = piv.matrix_world.inverted()
    bpy.context.view_layer.update()
    for o in head_objs:
        for x in bpy.data.objects:
            x.select_set(False)
        bpy.context.view_layer.objects.active = o; o.select_set(True)
        bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.data.objects.remove(piv)

    # ---- neckerchief, apron (a flared bib with straps and a pocket) ----------------------
    mk(b.torus(0.060, 0.013, (0, 0.012, 1.505), BAND, scale=(1, 1.05, 0.9)))
    mk(b.ball(0.017, (0, -0.056, 1.50), BAND, (1.0, 0.8, 1.3)))
    prof = [(0.235, 0.76), (0.215, 0.88), (0.190, 1.04), (0.178, 1.19), (0.150, 1.31), (0.125, 1.42)]
    depth = [0.150, 0.130, 0.112, 0.114, 0.112, 0.108]
    seg = 12 if low else 22
    rows = []
    for (hw, z), dp in zip(prof, depth):
        rows.append([(math.cos(math.radians(200 + 140*i/seg))*hw*k*1.02, math.sin(math.radians(200 + 140*i/seg))*dp*k, z) for i in range(seg+1)])
    mk(b.shell("apron", rows, APRON, thickness=0.012, offset=1, subd=1))
    mk(b.box((0.11*k, 0.012, 0.07), (0, -0.126*k, 0.98), POCKET, bevel=0.012))
    for s in (-1, 1):   # straps from the bib's top corners over the shoulders
        mk(b.bar((s*0.12*k, -0.108*k, 1.42), (s*0.10, -0.02, 1.50), 0.024, APRON))

    # ---- arms: the left rests, the right is the waving one on its own pivot -----------------
    def arm(s, name, pose):
        sh = (s*0.225, 0, 1.40)
        parts = [
            b.limb("ua", [(s*0.225, 0, 1.40, 0.062, 0.062), (s*0.250, 0, 1.24, 0.054, 0.054), (s*0.262, 0, 1.12, 0.048, 0.048)], SHIRT),
            b.limb("fa", [(s*0.262, 0, 1.12, 0.044, 0.044), (s*0.274, 0, 0.97, 0.036, 0.036), (s*0.280, 0, 0.88, 0.030, 0.032)], SKIN),
            b.ball(0.058, (s*0.264, 0, 1.12), SHIRT, (1, 1, 0.55)),
            b.ball(0.040, (s*0.284, 0, 0.82), SKIN, (0.75, 0.5, 1.35)),
            b.ball(0.026, (s*0.287, -0.012, 0.77), SKIN, (0.8, 0.5, 1.0)),
            b.ball(0.016, (s*0.250, -0.020, 0.84), SKIN, (0.6, 0.6, 1.5), rot=(0, math.radians(s*20), 0)),
        ]
        bpy.ops.object.empty_add(location=sh)
        pv = bpy.context.object
        pv.name = name
        for p in parts:
            p.parent = pv
            p.matrix_parent_inverse = pv.matrix_world.inverted()
        pv.rotation_euler = pose
        return pv, parts
    rest_pv, rest_parts = arm(-1, "arm_rest", (math.radians(-62), 0, math.radians(6)))
    wave_pv, wave_parts = arm(1, "arm_wave", (math.radians(-4), 0, math.radians(-6)))
    for p in rest_parts:  # the resting arm is part of the body mesh: bake its pivot pose in
        for x in bpy.data.objects:
            x.select_set(False)
        bpy.context.view_layer.objects.active = p; p.select_set(True)
        bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
        made.append(p)
    bpy.data.objects.remove(rest_pv)

    # ---- height, then join and decimate -----------------------------------------------------
    return made, b.keep, wave_pv, wave_parts, spec["height"]
