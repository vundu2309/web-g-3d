"""The four rods of the upgrade shop (CONCEPT stage: pictures only, nothing is exported yet).

Tier 0 BAMBOO (free), tier 1 FIBREGLASS, tier 2 CARBON FIBRE, tier 3 GOLD. Each is a loft through a
table of rings like src/ocean/rod-plan.ts (`s` along the 4 m rod, 0 at the butt; `r` the radius in
metres; two rings at the same `s` are a hard edge, equal radii a pure change of colour), with the
round orange tip every rod shares (it is the game's bite cue) and line guides. The rod is chunky on
purpose: at the chase camera (17.5 m) it is a few pixels wide, so a tier must read by its colour
bands and its thickness, not by a fine detail.

Every colour is a palette colour (palette.json / src/ocean/art/colors.ts PAL), by role. The thread
wraps are the one place the boat's own trim colour goes in the game (so a rod still matches its
boat); here they are a stand-in, PAINT coral.

Like props.py this never calls `lib.reset()`: it builds in a NEW scene of the running Blender.

    import sys; sys.path.insert(0, "/path/to/tools/blender")
    import importlib, rods; importlib.reload(rods)
    rods.build_scene("Rods"); rods.previews("/scratch/dir")
"""
import math, os
import bpy, bmesh
from mathutils import Matrix, Vector
import lib

PAL = lib.PAL
ROD = PAL["rod"]
WOOD = PAL["wood"]
METAL = PAL["metal"]
PAINT = PAL["paint"]
PEOPLE = PAL["people"]
CLOTHES = PEOPLE["clothes"]

LENGTH = 4.0  # the rod's length (rod.ts ROD_LENGTH), metres
LEAN = 0.95  # how far the rod leans outward from the vertical (rod.ts ROD_LEAN), radians
SIDES = 10
CURVE = 0.3  # how far the tip is bent toward the reel's side at rest (m, a quadratic curve along the rod)
SLIM = 0.62  # the blank, handle and guides are this share of the first concept's thickness
TIP_SLIM = 0.82  # the round orange tip is the bite cue: it keeps most of its size

COL = {
    # shared by every rod
    "cap": ROD["cap"],
    "tip": ROD["tip"],
    "cork": ROD["cork"],
    "steel": METAL["light"],
    "dark": METAL["steel"],
    # bamboo
    "culm": WOOD["trim"],
    "node": WOOD["deep"],
    "wrap": PAINT["coral"],
    # fibreglass
    "glass": PAINT["white"],
    "glassBand": CLOTHES["jeans"],
    "foam": PAINT["green"],
    # carbon
    "carbonA": PEOPLE["hair"]["black"],
    "carbonB": METAL["steel"],
    "carbonWrap": PAINT["red"],
    "grip": PEOPLE["hair"]["black"],
    # gold
    "gold": PAL["market"]["coin"],
    "goldPale": PAINT["creamWarm"],
    "gem": ROD["reel"],
    "rosewood": WOOD["deep"],
    # reels
    "reel": ROD["reel"],
    "accent": ROD["accent"],
    "pearl": PAINT["white"],
}


def R(s, r, c):
    return (s, r, c)


# (s, radius, colour) from the butt to the tip. The last rings are the shared round tip.
TIP = [
    R(0.93, 0.042, "tip"), R(0.965, 0.07, "tip"), R(0.995, 0.105, "tip"),
    R(1.03, 0.095, "tip"), R(1.058, 0.06, "tip"), R(1.068, 0.0, "tip"),
]

PLANS = {
    # BAMBOO: the cork handle of today's rod, a tan culm with dark nodes that bulge a little, thread
    # wraps at the ferrule. The thickest blank of the four.
    "bamboo": [
        R(0, 0, "cap"), R(0, 0.085, "cap"), R(0, 0.125, "cork"), R(0.045, 0.145, "cork"),
        R(0.17, 0.135, "cork"), R(0.195, 0.118, "cork"),
        R(0.195, 0.118, "wrap"), R(0.225, 0.112, "wrap"),
        R(0.225, 0.112, "culm"), R(0.395, 0.09, "culm"),
        R(0.395, 0.098, "node"), R(0.415, 0.098, "node"),
        R(0.415, 0.088, "culm"), R(0.565, 0.074, "culm"),
        R(0.565, 0.082, "node"), R(0.585, 0.082, "node"),
        R(0.585, 0.072, "culm"), R(0.735, 0.058, "culm"),
        R(0.735, 0.066, "node"), R(0.755, 0.066, "node"),
        R(0.755, 0.056, "culm"), R(0.93, 0.042, "culm"),
    ] + TIP,
    # FIBREGLASS: a smooth white blank with two blue bands, a long steel ferrule and a green foam
    # handle with a collar. A little slimmer than bamboo.
    "fibreglass": [
        R(0, 0, "cap"), R(0, 0.09, "cap"), R(0, 0.13, "foam"), R(0.05, 0.15, "foam"),
        R(0.2, 0.14, "foam"), R(0.235, 0.122, "foam"),
        R(0.235, 0.122, "steel"), R(0.285, 0.108, "steel"),
        R(0.285, 0.104, "glass"), R(0.42, 0.088, "glass"),
        R(0.42, 0.088, "glassBand"), R(0.455, 0.084, "glassBand"),
        R(0.455, 0.084, "glass"), R(0.62, 0.066, "glass"),
        R(0.62, 0.066, "glassBand"), R(0.655, 0.062, "glassBand"),
        R(0.655, 0.062, "glass"), R(0.93, 0.04, "glass"),
    ] + TIP,
    # CARBON FIBRE: the slimmest blank and the longest handle, a woven look made of short dark and
    # steel-grey bands, red thread wraps at the ferrule and between the guides.
    "carbon": [
        R(0, 0, "cap"), R(0, 0.085, "cap"), R(0, 0.12, "grip"), R(0.04, 0.138, "grip"),
        R(0.1, 0.132, "grip"), R(0.1, 0.132, "cork"), R(0.14, 0.13, "cork"),
        R(0.14, 0.13, "grip"), R(0.255, 0.114, "grip"),
        R(0.255, 0.114, "carbonWrap"), R(0.28, 0.104, "carbonWrap"),
        R(0.28, 0.1, "carbonA"), R(0.345, 0.088, "carbonA"),
        R(0.345, 0.088, "carbonB"), R(0.41, 0.08, "carbonB"),
        R(0.41, 0.08, "carbonA"), R(0.475, 0.074, "carbonA"),
        R(0.475, 0.074, "carbonB"), R(0.54, 0.068, "carbonB"),
        R(0.54, 0.068, "carbonA"), R(0.605, 0.062, "carbonA"),
        R(0.605, 0.062, "carbonB"), R(0.67, 0.056, "carbonB"),
        R(0.67, 0.056, "carbonA"), R(0.735, 0.05, "carbonA"),
        R(0.735, 0.05, "carbonB"), R(0.8, 0.045, "carbonB"),
        R(0.8, 0.045, "carbonA"), R(0.93, 0.036, "carbonA"),
    ] + TIP,
    # GOLD: a rosewood handle ringed in gold with a red gem band, a wide gold collar, a gold blank
    # with pale-gold bands. Fat in the hand, rich at a glance.
    "gold": [
        R(0, 0, "gold"), R(0, 0.1, "gold"), R(0.015, 0.145, "gold"), R(0.045, 0.15, "rosewood"),
        R(0.07, 0.152, "rosewood"), R(0.07, 0.152, "gold"), R(0.09, 0.152, "gold"),
        R(0.09, 0.15, "rosewood"), R(0.13, 0.148, "rosewood"),
        R(0.13, 0.148, "gem"), R(0.15, 0.148, "gem"),
        R(0.15, 0.146, "rosewood"), R(0.19, 0.136, "rosewood"),
        R(0.19, 0.136, "gold"), R(0.215, 0.142, "gold"), R(0.25, 0.142, "gold"),
        R(0.275, 0.112, "gold"),
        R(0.275, 0.108, "gold"), R(0.4, 0.09, "gold"),
        R(0.4, 0.09, "goldPale"), R(0.43, 0.087, "goldPale"),
        R(0.43, 0.087, "gold"), R(0.58, 0.07, "gold"),
        R(0.58, 0.07, "goldPale"), R(0.61, 0.067, "goldPale"),
        R(0.61, 0.067, "gold"), R(0.75, 0.054, "gold"),
        R(0.75, 0.054, "goldPale"), R(0.78, 0.052, "goldPale"),
        R(0.78, 0.052, "gold"), R(0.93, 0.042, "gold"),
    ] + TIP,
}

# Guide positions (the plan's GUIDES) and the colour of the eyelets of each rod.
GUIDES = (0.34, 0.53, 0.72, 0.89)
GUIDE_COLOUR = {"bamboo": "steel", "fibreglass": "steel", "carbon": "dark", "gold": "gold"}
ORDER = ("bamboo", "fibreglass", "carbon", "gold")


def radius_at(plan, s):
    for a, b in zip(plan, plan[1:]):
        if b[0] > a[0] and a[0] <= s <= b[0]:
            return a[1] + (b[1] - a[1]) * (s - a[0]) / (b[0] - a[0])
    return 0.04


def bend(bm):
    """A slight permanent curve: the tip leans CURVE metres toward +X (the reel's side, the way the
    line pulls), growing with the square of the height, so the butt stays straight."""
    for v in bm.verts:
        v.co.x += CURVE * (max(v.co.z, 0.0) / LENGTH) ** 2


def loft(name, plan, guide_colour, collection):
    """The rod standing up along +Z (the butt at the origin), one mesh, a material per colour."""
    me = bpy.data.meshes.new(name)
    o = bpy.data.objects.new(name, me)
    collection.objects.link(o)
    mats = {}

    def slot(key):
        if key not in mats:
            mats[key] = len(mats)
            o.data.materials.append(lib.mat(f"rod-{key}", COL[key], 0.45 if key in ("gold", "steel") else 0.6))
        return mats[key]

    bm = bmesh.new()
    rings = []
    for s, r, c in plan:
        r = r * (TIP_SLIM if c == "tip" else SLIM)
        ring = []
        for k in range(SIDES):
            a = 2 * math.pi * k / SIDES
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), s * LENGTH)))
        rings.append(ring)
    for i in range(len(plan) - 1):
        a, b = plan[i], plan[i + 1]
        if a[0] == b[0] and a[1] == b[1]:
            continue  # a pure change of colour: no surface
        # a strip is the colour of its lower ring (the two rings of a strip share a colour)
        col = a[2]
        for k in range(SIDES):
            f = bm.faces.new((rings[i][k], rings[i][(k + 1) % SIDES], rings[i + 1][(k + 1) % SIDES], rings[i + 1][k]))
            f.material_index = slot(col)
            f.smooth = True
    # a guide is a small flat ring facing the stern (-Y here), standing off the blank
    for g in GUIDES:
        r0 = radius_at(plan, g) * SLIM
        cy = -(r0 + 0.05)
        outer, inner = 0.09, 0.05
        ring = []
        for k in range(8):
            a = 2 * math.pi * k / 8
            ring.append((bm.verts.new((outer * math.cos(a), cy - 0.0, g * LENGTH + outer * math.sin(a))),
                         bm.verts.new((inner * math.cos(a), cy - 0.0, g * LENGTH + inner * math.sin(a)))))
        for k in range(8):
            n = (k + 1) % 8
            f = bm.faces.new((ring[k][0], ring[n][0], ring[n][1], ring[k][1]))
            f.material_index = slot(guide_colour)
        # the foot joining the eyelet to the blank
        foot = bm.faces.new((bm.verts.new((-0.015, -r0, g * LENGTH)), bm.verts.new((0.015, -r0, g * LENGTH)),
                             bm.verts.new((0.015, cy, g * LENGTH)), bm.verts.new((-0.015, cy, g * LENGTH))))
        foot.material_index = slot(guide_colour)
    bend(bm)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    return o


# --- the reel under the handle -------------------------------------------------------------------
# In the game the reel hangs under the handle on the side the rod leans away from, its round face
# turned to the stern (the chase camera looks at it), joined to the handle by a short stem
# (rod-visual.ts). Here the rod stands along +Z, the camera looks along +Y from -Y, and "under the
# handle" is +X. The better the rod, the finer the reel: a plain plastic reel, a banded one, a
# machined one with an anodised ring and a drag knob, and a golden one with pearls and a gem.
REEL_Z = 0.5  # where on the rod (m from the butt) the stem leaves the handle


class Mesh:
    """A small helper to add primitives to one bmesh, each with a material colour key."""

    def __init__(self, name, collection):
        self.me = bpy.data.meshes.new(name)
        self.o = bpy.data.objects.new(name, self.me)
        collection.objects.link(self.o)
        self.bm = bmesh.new()
        self.slots = {}

    def _slot(self, key):
        if key not in self.slots:
            self.slots[key] = len(self.slots)
            self.o.data.materials.append(
                lib.mat(f"rod-{key}", COL[key], 0.35 if key in ("gold", "steel", "dark", "gem", "pearl") else 0.55))
        return self.slots[key]

    def _tag(self, geom, key):
        i = self._slot(key)
        for f in geom["faces"] if isinstance(geom, dict) else [g for g in geom if isinstance(g, bmesh.types.BMFace)]:
            f.material_index = i
            f.smooth = True

    def disc(self, centre, radius, depth, key, segs=18, radius2=None):
        """A cylinder whose axis is Y (a face turned to the camera at -Y)."""
        m = Matrix.Translation(Vector(centre)) @ Matrix.Rotation(math.pi / 2, 4, "X")
        g = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segs,
                                  radius1=radius, radius2=radius if radius2 is None else radius2,
                                  depth=depth, matrix=m)
        self._tag({"faces": [f for f in self.bm.faces if all(v in g["verts"] for v in f.verts)]}, key)

    def rod_cyl(self, centre, radius, length, key, axis="X", segs=10):
        """A cylinder along X (a stem) or Z."""
        rot = Matrix.Rotation(math.pi / 2, 4, "Y") if axis == "X" else Matrix.Identity(4)
        g = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segs, radius1=radius,
                                  radius2=radius, depth=length, matrix=Matrix.Translation(Vector(centre)) @ rot)
        self._tag({"faces": [f for f in self.bm.faces if all(v in g["verts"] for v in f.verts)]}, key)

    def ball(self, centre, radius, key, squash=1.0, segs=10):
        m = Matrix.Translation(Vector(centre)) @ Matrix.Diagonal((1, squash, 1, 1))
        g = bmesh.ops.create_uvsphere(self.bm, u_segments=segs, v_segments=max(4, segs // 2), radius=radius, matrix=m)
        self._tag({"faces": [f for f in self.bm.faces if all(v in g["verts"] for v in f.verts)]}, key)

    def box(self, centre, size, key, turn=0.0):
        """A box turned about Y (the camera's axis) by `turn`."""
        m = Matrix.Translation(Vector(centre)) @ Matrix.Rotation(turn, 4, "Y") @ Matrix.Diagonal((size[0], size[1], size[2], 1))
        g = bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        self._tag({"faces": [f for f in self.bm.faces if all(v in g["verts"] for v in f.verts)]}, key)

    def finish(self, curved=False):
        if curved:
            bend(self.bm)
        self.bm.normal_update()
        self.bm.to_mesh(self.me)
        self.bm.free()
        return self.o


def build_reel(name, tier, collection):
    """The reel of one rod (and the small ornaments that go with it), as its own mesh object."""
    m = Mesh(f"reel-{name}", collection)
    R = {"bamboo": 0.28, "fibreglass": 0.30, "carbon": 0.32, "gold": 0.35}[name]
    handle = {"bamboo": 0.09, "fibreglass": 0.095, "carbon": 0.085, "gold": 0.095}[name]
    cx = handle + 0.1 + R  # centre of the reel, under the handle
    z = REEL_Z
    depth = {"bamboo": 0.15, "fibreglass": 0.17, "carbon": 0.19, "gold": 0.21}[name]
    face = -depth / 2  # y of the front face
    stem = {"bamboo": "dark", "fibreglass": "steel", "carbon": "dark", "gold": "gold"}[name]
    m.rod_cyl((handle + 0.05 + R / 2 + 0.02, 0, z), 0.05 if name != "gold" else 0.058, R + 0.14, stem, "X")
    if name == "bamboo":
        # plain: a red plastic body, a light plate, a crank with a yellow knob
        m.disc((cx, 0, z), R, depth, "reel")
        m.disc((cx, face - 0.01, z), R * 0.58, 0.03, "steel")
        m.box((cx + 0.13, face - 0.05, z - 0.03), (0.26, 0.04, 0.05), "dark", turn=0.3)
        m.ball((cx + 0.26, face - 0.07, z - 0.08), 0.08, "accent")
    elif name == "fibreglass":
        # a blue body with a steel rim front and back, a white plate, a visible spool of line
        m.disc((cx, 0, z), R, depth, "glassBand")
        m.disc((cx, face + 0.01, z), R + 0.015, 0.03, "steel")  # the rim, a thin plate behind the face
        m.disc((cx, -face - 0.01, z), R + 0.015, 0.03, "steel")
        m.disc((cx, face - 0.012, z), R * 0.9, 0.025, "glassBand")
        m.disc((cx, face - 0.03, z), R * 0.66, 0.03, "glass")
        m.disc((cx, face - 0.05, z), R * 0.3, 0.03, "steel")
        m.box((cx + 0.14, face - 0.06, z - 0.03), (0.28, 0.04, 0.055), "steel", turn=0.3)
        m.ball((cx + 0.28, face - 0.085, z - 0.09), 0.095, "accent")
    elif name == "carbon":
        # machined: a steel-grey body, dark rims, a red anodised ring, a drag knob on top, a long
        # slim crank with a red knob
        m.disc((cx, 0, z), R, depth, "carbonB")
        m.disc((cx, face - 0.005, z), R + 0.012, 0.035, "dark")
        m.disc((cx, -face + 0.005, z), R + 0.012, 0.035, "dark")
        m.disc((cx, face - 0.02, z), R * 0.8, 0.03, "carbonWrap")
        m.disc((cx, face - 0.04, z), R * 0.58, 0.03, "carbonA")
        m.disc((cx, face - 0.06, z), R * 0.18, 0.04, "steel")
        m.rod_cyl((cx, 0, z + R + 0.06), 0.07, 0.1, "steel", "Z", segs=6)  # the drag knob
        m.box((cx + 0.17, face - 0.07, z - 0.04), (0.36, 0.035, 0.045), "dark", turn=0.3)
        m.ball((cx + 0.35, face - 0.1, z - 0.11), 0.075, "carbonWrap")
    else:
        # gold: a golden body, a ring of fourteen pearls round its rim, a pale plate, a red gem in
        # the middle, a gem on the crank, and a collar on the stem
        m.disc((cx, 0, z), R, depth, "gold")
        m.disc((cx, face + 0.01, z), R + 0.018, 0.03, "goldPale")  # a pale rim behind the face
        m.disc((cx, face - 0.012, z), R * 0.92, 0.025, "gold")
        for i in range(14):
            a = 2 * math.pi * i / 14
            m.ball((cx + (R + 0.005) * math.cos(a), face - 0.03, z + (R + 0.005) * math.sin(a)), 0.034, "pearl", segs=6)
        m.disc((cx, face - 0.03, z), R * 0.74, 0.03, "goldPale")
        m.disc((cx, face - 0.05, z), R * 0.6, 0.03, "gold")
        m.disc((cx, face - 0.065, z), R * 0.38, 0.025, "goldPale")
        m.ball((cx, face - 0.085, z), 0.085, "gem", squash=0.6)
        m.box((cx + 0.17, face - 0.07, z - 0.04), (0.34, 0.04, 0.055), "gold", turn=0.3)
        m.ball((cx + 0.34, face - 0.1, z - 0.11), 0.095, "gem", squash=0.7)
        m.rod_cyl((handle + 0.05 + 0.05, 0, z), 0.075, 0.05, "goldPale", "X")  # the collar on the stem
    return m.finish()  # the reel is held in the hand: it does not bend


def build_ornaments(name, plan, collection):
    """What makes the rarer rods prettier than a plain tube: gems on the gold rod's guides and a
    pearl under its tip, red thread-wrap dots on the carbon one."""
    if name not in ("gold", "carbon"):
        return None
    m = Mesh(f"ornaments-{name}", collection)
    for g in GUIDES:
        r0 = radius_at(plan, g) * SLIM
        y = -(r0 + 0.05) - 0.01
        if name == "gold":
            m.ball((0, y - 0.02, g * LENGTH + 0.09), 0.032, "gem", squash=0.7, segs=6)
        else:
            m.ball((0, y - 0.015, g * LENGTH + 0.09), 0.026, "carbonWrap", squash=0.7, segs=6)
    if name == "gold":
        m.ball((0, 0, 0.93 * LENGTH - 0.02), 0.06, "pearl", segs=8)
    return m.finish(curved=True)


def _lin(h):
    return tuple(((c / 255) ** 2.2) for c in ((h >> 16) & 255, (h >> 8) & 255, h & 255))


def build_scene(scene_name="Rods", spacing=1.3):
    """A NEW scene with the four rods upright side by side (left to right: bamboo, fibreglass,
    carbon, gold), a soft light and an orthographic camera."""
    scene = bpy.data.scenes.get(scene_name) or bpy.data.scenes.new(scene_name)
    for o in list(scene.collection.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    col = bpy.data.collections.get("rods") or bpy.data.collections.new("rods")
    if col.name not in [c.name for c in scene.collection.children]:
        scene.collection.children.link(col)
    made = {}
    for i, name in enumerate(ORDER):
        o = loft(f"rod-{name}", PLANS[name], GUIDE_COLOUR[name], col)
        o.location = (i * spacing, 0, 0)
        for extra in (build_reel(name, i, col), build_ornaments(name, PLANS[name], col)):
            if extra is not None:
                extra.parent = o
        made[name] = o
    world = bpy.data.worlds.get("rods-world") or bpy.data.worlds.new("rods-world")
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    path = nt.nodes.new("ShaderNodeLightPath")
    card = nt.nodes.new("ShaderNodeBackground")
    card.inputs["Color"].default_value = (*_lin(0xF6FBFF), 1)
    sky = nt.nodes.new("ShaderNodeBackground")
    sky.inputs["Color"].default_value = (0.75, 0.82, 0.95, 1)
    sky.inputs["Strength"].default_value = 0.6
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(path.outputs["Is Camera Ray"], mix.inputs[0])
    nt.links.new(sky.outputs[0], mix.inputs[1])
    nt.links.new(card.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])
    scene.world = world
    sun_data = bpy.data.lights.get("rods-sun") or bpy.data.lights.new("rods-sun", "SUN")
    sun_data.energy = 2.8
    sun_data.color = (1.0, 0.96, 0.9)
    sun = bpy.data.objects.new("rods-sun", sun_data)
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(30))
    scene.collection.objects.link(sun)
    cam_data = bpy.data.cameras.get("rods-cam") or bpy.data.cameras.new("rods-cam")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("rods-cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = "BLENDER_EEVEE"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    return made


def _aim(scene, centre, width, res, yaw=0.0):
    """Face the rods from the stern side (-Y), a little from above, ortho `width` metres wide."""
    cam = scene.camera
    d = Vector((math.sin(yaw) * 0.35, -1.0, 0.18)).normalized()
    cam.location = Vector(centre) + d * 20.0
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    cam.data.ortho_scale = width
    scene.render.resolution_x, scene.render.resolution_y = res


def render(scene, path):
    bpy.context.window.scene = scene
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True, scene=scene.name)
    return path


def _lay_out(scene, spacing, lean):
    """Stand the four rods side by side `spacing` apart, upright or leaned as in the game."""
    for i, name in enumerate(ORDER):
        o = scene.objects[f"rod-{name}"]
        o.location = (i * spacing, 0, 0)
        o.rotation_euler = (0, LEAN if lean else 0, 0)


def previews(out_dir, scene_name="Rods", spacing=1.3):
    scene = bpy.data.scenes[scene_name]
    os.makedirs(out_dir, exist_ok=True)
    done = {}
    _lay_out(scene, spacing, False)
    mid = 1.5 * spacing
    # the four rods upright, full length, reel to the right
    _aim(scene, (mid + 0.3, 0, 2.15), 6.2, (1600, 1300))
    done["full"] = render(scene, os.path.join(out_dir, "rods-full.png"))
    # handles, reels and ferrules, close
    _aim(scene, (mid + 0.5, 0, 0.55), 5.6, (1500, 800))
    done["handles"] = render(scene, os.path.join(out_dir, "rods-handles.png"))
    # the tips
    _aim(scene, (mid, 0, 3.7), 5.2, (1500, 700))
    done["tips"] = render(scene, os.path.join(out_dir, "rods-tips.png"))
    # as the game holds them: leaned out 0.95 rad, seen from the stern (the reel hangs below)
    _lay_out(scene, 3.9, True)
    _aim(scene, (1.5 * 3.9 + 1.2, 0, 1.4), 17.0, (1700, 560))
    done["lean"] = render(scene, os.path.join(out_dir, "rods-lean.png"))
    # and at the size the chase camera shows them: about 75 px for the whole rod
    _aim(scene, (1.5 * 3.9 + 1.2, 0, 1.4), 21.3, (400, 132))
    done["chase"] = render(scene, os.path.join(out_dir, "rods-chase-size.png"))
    _lay_out(scene, spacing, False)
    done["tris"] = {n: lib.triangles(scene.objects[f"rod-{n}"])
                    + sum(lib.triangles(c) for c in scene.objects[f"rod-{n}"].children) for n in ORDER}
    return done
