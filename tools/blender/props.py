"""Island props for the sea game: palms, rocks, bushes and a stilt hut, built from the game's palette.

They are stylised low-poly pieces (a bent, ringed palm trunk and arching fronds with a fold down the
middle, faceted rocks with moss on top, a stilt hut with a stepped thatch roof), made with bmesh,
one material per colour so `lib.bake_colors` can write the game's sRGB colours to vertex colours.

Unlike `build.py` this never calls `lib.reset()`: it adds everything to a NEW scene of the running
Blender (so the user's own scene is untouched), which is how it is driven through the Blender MCP:

    import sys; sys.path.insert(0, "/path/to/tools/blender")
    import importlib, props; importlib.reload(props)
    props.build_scene("Props"); props.render("/tmp/props.png")

`props.export_glb(dir)` writes one GLB per asset for the game (palm-1..3, rock-1..3, bush-1..3, hut).
"""
import math, os, random
import bpy, bmesh
from mathutils import Matrix, Vector, noise
import lib

PAL = lib.PAL
P = PAL["plants"]
S = PAL["stone"]


WOOD = int(PAL["market"]["post"])  # the pier posts
WOOD_DARK = 0x5b3b28
STRAW = [0xe9d48f, 0xd9be72, 0xc9a85c]
STRAW_EDGE = 0xb8934a


# ------------------------------------------------------------------------------------------------
# Small helpers
# ------------------------------------------------------------------------------------------------
class Mesh:
    """A bmesh being built with one material per colour."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.mats = []  # (material name, hex)

    def slot(self, hexint):
        key = f"c{hexint:06x}"
        for i, (n, _) in enumerate(self.mats):
            if n == key:
                return i
        self.mats.append((key, hexint))
        return len(self.mats) - 1

    def quad(self, verts, hexint):
        try:
            f = self.bm.faces.new(verts)
        except ValueError:
            return None
        f.material_index = self.slot(hexint)
        return f

    def tri(self, verts, hexint):
        return self.quad(verts, hexint)

    def vert(self, p):
        return self.bm.verts.new(Vector(p))

    def object(self, collection, smooth=False):
        me = bpy.data.meshes.new(self.name)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])
        self.bm.to_mesh(me)
        self.bm.free()
        for n, h in self.mats:
            me.materials.append(lib.mat(n, h, 0.9))
        for p in me.polygons:
            p.use_smooth = smooth
        o = bpy.data.objects.new(self.name, me)
        collection.objects.link(o)
        return o


def lerp(a, b, t):
    return a + (b - a) * t


def mix_hex(a, b, t):
    ca = [(a >> 16) & 255, (a >> 8) & 255, a & 255]
    cb = [(b >> 16) & 255, (b >> 8) & 255, b & 255]
    c = [round(lerp(x, y, t)) for x, y in zip(ca, cb)]
    return (c[0] << 16) | (c[1] << 8) | c[2]


def frame(tangent):
    """Two unit vectors perpendicular to the tangent."""
    t = tangent.normalized()
    up = Vector((0, 0, 1)) if abs(t.z) < 0.95 else Vector((1, 0, 0))
    u = t.cross(up).normalized()
    v = t.cross(u).normalized()
    return u, v


# ------------------------------------------------------------------------------------------------
# Palm
# ------------------------------------------------------------------------------------------------
def palm(collection, seed, height=6.2, lean=0.9, fronds=15, name=None):
    rng = random.Random(seed)
    m = Mesh(name or f"palm-{seed}")
    bm = m.bm
    # Trunk: a slow bend toward one side, rings with scars, a flared base.
    heading = rng.uniform(0, math.tau)
    bend = lean * rng.uniform(0.8, 1.3)
    rings = 13
    sides = 9
    pts = []
    for i in range(rings):
        t = i / (rings - 1)
        pts.append(Vector((math.cos(heading) * bend * t * t * 1.6, math.sin(heading) * bend * t * t * 1.6, height * t)))
    ring_verts = []
    u = None
    for i, p in enumerate(pts):
        t = i / (rings - 1)
        tan = (pts[min(i + 1, rings - 1)] - pts[max(i - 1, 0)]).normalized()
        if u is None:
            u, v = frame(tan)
        else:  # parallel transport: keep the ring's frame from twisting between rings
            u = (u - tan * u.dot(tan)).normalized()
            v = tan.cross(u).normalized()
        r = lerp(0.27, 0.13, t) * (1.0 + (0.07 if i % 2 else 0.0)) * (1.0 + 0.55 * max(0.0, 0.12 - t) / 0.12 * 0.5)
        ring = []
        for k in range(sides):
            a = math.tau * k / sides + 0.35 * t
            jitter = 1.0 + 0.05 * noise.noise(Vector((k * 1.7, i * 0.9, seed)))
            ring.append(m.vert(p + (u * math.cos(a) + v * math.sin(a)) * r * jitter))
        ring_verts.append(ring)
    for i in range(rings - 1):
        c = mix_hex(WOOD, WOOD_DARK, 0.55 if i % 2 else 0.1)
        for k in range(sides):
            a, b = ring_verts[i][k], ring_verts[i][(k + 1) % sides]
            c2, d = ring_verts[i + 1][(k + 1) % sides], ring_verts[i + 1][k]
            m.quad([a, b, c2, d], c)
    top = pts[-1]
    # Crown: arching fronds, folded along the rib, with a saw-tooth edge.
    leaves = P["leaves"]
    for j in range(fronds):
        ang = math.tau * j / fronds + rng.uniform(-0.18, 0.18)
        low = j % 3 == 2  # every third frond hangs lower, like the old outer ones
        length = rng.uniform(2.9, 3.7) * (1.05 if low else 1.0)
        width = rng.uniform(0.62, 0.82)
        rise = rng.uniform(0.05, 0.25) if low else rng.uniform(0.55, 0.95)
        segs = 12
        mid, left, right = [], [], []
        for s in range(segs + 1):
            t = s / segs
            x = length * t
            z = length * (rise * t - 0.85 * t * t) + (0.12 * length * t if low else 0.0)
            w = width * (1 - t) ** 0.65 * (1.0 if s % 2 == 0 else 0.62) * (0.35 + 0.65 * math.sin(min(1.0, t * 3.0) * math.pi / 2))
            fold = 0.28 * w
            mid.append(m.vert((x, 0, z)))
            left.append(m.vert((x + 0.06 * (s % 2), w, z - fold)))
            right.append(m.vert((x + 0.06 * (s % 2), -w, z - fold)))
        for s in range(segs):
            t = (s + 0.5) / segs
            base = P["frond"] if rng.random() > 0.3 else leaves[rng.randrange(len(leaves))]
            col = mix_hex(leaves[0], mix_hex(base, 0xa5d670, 0.5), t)
            m.quad([left[s], mid[s], mid[s + 1], left[s + 1]], col)
            m.quad([mid[s], right[s], right[s + 1], mid[s + 1]], mix_hex(col, leaves[0], 0.18))
        # move the frond: yaw around the crown, a little pitch and roll
        verts = mid + left + right
        bmesh.ops.rotate(bm, verts=verts, cent=(0, 0, 0), matrix=Matrix.Rotation(ang, 3, "Z"))
        bmesh.ops.translate(bm, verts=verts, vec=top + Vector((0, 0, 0.05)))
    # Coconuts.
    for j in range(3):
        a = rng.uniform(0, math.tau)
        c = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.13)
        bmesh.ops.translate(bm, verts=c["verts"], vec=top + Vector((math.cos(a) * 0.2, math.sin(a) * 0.2, -0.12)))
        for f in {f for v in c["verts"] for f in v.link_faces}:
            f.material_index = m.slot(0x6b4a2f if j % 2 else 0x7f9a3a)
    return m.object(collection)


# ------------------------------------------------------------------------------------------------
# Rocks
# ------------------------------------------------------------------------------------------------
def rock(collection, seed, size=1.0, flat=0.62, name=None):
    rng = random.Random(seed)
    m = Mesh(name or f"rock-{seed}")
    bm = m.bm
    ico = bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    off = Vector((rng.uniform(-9, 9), rng.uniform(-9, 9), rng.uniform(-9, 9)))
    for v in bm.verts:
        n = v.co.normalized()
        d = 1.0 + 0.30 * noise.noise(n * 1.5 + off) + 0.14 * noise.noise(n * 3.6 + off) + 0.05 * noise.noise(n * 8.0 + off)
        v.co = n * d
        v.co.x *= size * rng.uniform(1.0, 1.25)
        v.co.y *= size * rng.uniform(0.85, 1.1)
        v.co.z *= size * flat
        if v.co.z < -0.25 * size:
            v.co.z = -0.25 * size
    for f in bm.faces:
        n = f.normal
        top = n.z > 0.62 and noise.noise(f.calc_center_median() * 1.1 + off) > 0.12
        if top:
            col = mix_hex(S["moss"], P["grassLow"], rng.random() * 0.35)
        else:
            col = mix_hex(S["rock"], S["dark"], 0.25 + 0.55 * (0.5 - 0.5 * n.z) + rng.uniform(-0.08, 0.08))
        f.material_index = m.slot(col)
    return m.object(collection, smooth=False)


# ------------------------------------------------------------------------------------------------
# Bushes
# ------------------------------------------------------------------------------------------------
def bush(collection, seed, size=1.0, flowers=False, name=None):
    """A low, leafy bush: fifteen or so small lumpy leaf clumps heaped into a dome, lighter on top."""
    rng = random.Random(seed)
    m = Mesh(name or f"bush-{seed}")
    bm = m.bm
    leaves = P["leaves"]
    spread = 0.62 * size
    tops = []
    for i in range(rng.randint(14, 18)):
        a = rng.uniform(0, math.tau)
        reach = spread * math.sqrt(rng.uniform(0.0, 1.0))
        dome = math.sqrt(max(0.0, 1.0 - (reach / spread) ** 2))
        s = rng.uniform(0.2, 0.34) * size * (1.15 - 0.4 * reach / spread)
        centre = Vector((math.cos(a) * reach, math.sin(a) * reach, 0.12 * size + spread * 0.9 * dome * rng.uniform(0.55, 1.0)))
        off = Vector((rng.uniform(-9, 9), rng.uniform(-9, 9), rng.uniform(-9, 9)))
        ico = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
        for v in ico["verts"]:
            n = v.co.normalized()
            d = 1.0 + 0.25 * noise.noise(n * 1.7 + off)
            v.co = Vector((n.x * d * s * rng.uniform(0.95, 1.2), n.y * d * s, n.z * d * s * 0.8)) + centre
            if v.co.z < 0.0:
                v.co.z = 0.0
        base = leaves[rng.randrange(len(leaves))]
        for f in {f for v in ico["verts"] for f in v.link_faces}:
            lit = max(0.0, f.normal.z)
            col = mix_hex(mix_hex(base, leaves[0], 0.45 * (1.0 - centre.z / (spread + 0.2))), 0xa5d670, lit * 0.42)
            f.material_index = m.slot(col)
        tops.append(centre + Vector((0, 0, s * 0.75)))
    if flowers:
        for t in rng.sample(tops, k=min(len(tops), 6)):
            c = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.085 * size)
            bmesh.ops.translate(bm, verts=c["verts"], vec=t + Vector((rng.uniform(-0.08, 0.08), rng.uniform(-0.08, 0.08), 0.02)))
            col = P["flowers"][rng.randrange(len(P["flowers"]))]
            for f in {f for v in c["verts"] for f in v.link_faces}:
                f.material_index = m.slot(col)
    # Smooth shading blends the clumps into one soft mass; the colours stay per face.
    return m.object(collection, smooth=True)


# ------------------------------------------------------------------------------------------------
# Stilt hut with a stepped thatch roof
# ------------------------------------------------------------------------------------------------
def box(m, cx, cy, cz, hx, hy, hz, hexint, taper=1.0):
    """An axis-aligned box (optionally narrower at the top by `taper`)."""
    bm = m.bm
    pts = {}
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (0, 1):
                k = taper if sz else 1.0
                pts[(sx, sy, sz)] = m.vert((cx + sx * hx * k, cy + sy * hy * k, cz + (sz * 2 - 1) * hz))
    q = lambda a, b, c, d: m.quad([pts[a], pts[b], pts[c], pts[d]], hexint)
    q((-1, -1, 0), (1, -1, 0), (1, 1, 0), (-1, 1, 0))
    q((-1, -1, 1), (-1, 1, 1), (1, 1, 1), (1, -1, 1))
    q((-1, -1, 0), (-1, -1, 1), (1, -1, 1), (1, -1, 0))
    q((1, -1, 0), (1, -1, 1), (1, 1, 1), (1, 1, 0))
    q((1, 1, 0), (1, 1, 1), (-1, 1, 1), (-1, 1, 0))
    q((-1, 1, 0), (-1, 1, 1), (-1, -1, 1), (-1, -1, 0))


def hut(collection, seed=3, name="hut"):
    rng = random.Random(seed)
    m = Mesh(name)
    deck_h = 1.25
    W, D = 1.7, 1.35  # half sizes of the floor
    # posts
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(m, sx * (W - 0.12), sy * (D - 0.12), deck_h / 2 - 0.4, 0.09, 0.09, deck_h / 2 + 0.4, WOOD)
    # deck planks
    n = 9
    for i in range(n):
        x = -W + (i + 0.5) * (2 * W / n)
        box(m, x, 0, deck_h + 0.04, W / n * 0.5, D + 0.15, 0.045, mix_hex(WOOD, 0xa87a4d, 0.25 + 0.5 * (i % 2)))
    for sx in (-1, 1):
        box(m, sx * (W - 0.12), 0, deck_h - 0.07, 0.07, D, 0.07, WOOD_DARK)
    # walls, a doorway and a window
    wall_h = 1.55
    base = deck_h + 0.09
    wc = PAL["hut"]["wall"]
    box(m, 0, -D + 0.18, base + wall_h / 2, W - 0.25, 0.05, wall_h / 2, wc)  # back wall
    box(m, 0, D - 0.18, base + wall_h / 2, W - 0.25, 0.05, wall_h / 2, wc)  # front wall (street side)
    box(m, -W + 0.3, 0, base + wall_h / 2, 0.05, D - 0.18, wall_h / 2, wc)
    box(m, W - 0.3, 0, base + wall_h / 2, 0.05, D - 0.18, wall_h / 2, wc)
    box(m, 0.45, D - 0.12, base + 0.8, 0.34, 0.012, 0.8, 0x4a3426)  # door (dark)
    box(m, -0.75, D - 0.12, base + 1.0, 0.26, 0.012, 0.22, PAL["hut"]["glass"])  # window
    box(m, -0.75, D - 0.11, base + 1.0, 0.3, 0.014, 0.03, WOOD)  # window sill
    # stepped thatch roof: a few tiers that narrow toward the ridge, each with a ragged fringe
    tiers = 5
    z = base + wall_h
    hx0, hy0 = W + 0.55, D + 0.5
    for i in range(tiers):
        t0, t1 = i / tiers, (i + 1) / tiers
        x0, y0 = hx0 * (1 - 0.82 * t0), hy0 * (1 - 0.82 * t0)
        x1, y1 = hx0 * (1 - 0.82 * t1), hy0 * (1 - 0.82 * t1)
        h = 0.52
        zb, zt = z + i * h * 0.78, z + i * h * 0.78 + h
        col = STRAW[i % 3]
        c = [m.vert((sx * x0, sy * y0, zb)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        d = [m.vert((sx * x1, sy * y1, zt)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        for a in range(4):
            b = (a + 1) % 4
            m.quad([c[a], c[b], d[b], d[a]], col)
        # fringe: small triangles hanging under the tier edge
        for a in range(4):
            b = (a + 1) % 4
            teeth = 7
            for k in range(teeth):
                f0, f1 = k / teeth, (k + 1) / teeth
                p0 = c[a].co.lerp(c[b].co, f0)
                p1 = c[a].co.lerp(c[b].co, f1)
                pm = c[a].co.lerp(c[b].co, (f0 + f1) / 2) + Vector((0, 0, -rng.uniform(0.16, 0.3)))
                m.tri([m.vert(p0), m.vert(pm), m.vert(p1)], STRAW_EDGE if k % 2 else col)
    # ridge cap
    top = z + (tiers - 1) * 0.52 * 0.78 + 0.52
    box(m, 0, 0, top + 0.08, hx0 * 0.2, hy0 * 0.2, 0.1, STRAW_EDGE)
    # ladder at the front
    for sx in (-0.18, 0.18):
        box(m, 0.45 + sx, D + 0.45, deck_h / 2 + 0.02, 0.035, 0.035, deck_h / 2 + 0.02, WOOD)
    for i in range(5):
        box(m, 0.45, D + 0.45, 0.2 + i * 0.24, 0.2, 0.025, 0.025, WOOD_DARK)
    return m.object(collection)


# ------------------------------------------------------------------------------------------------
# A scene to look at them, and export
# ------------------------------------------------------------------------------------------------
def build_scene(scene_name="Props"):
    """Adds a NEW scene with the props on a sand disc beside the sea, a sunset light and a camera."""
    scene = bpy.data.scenes.get(scene_name) or bpy.data.scenes.new(scene_name)
    for o in list(scene.collection.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    col = bpy.data.collections.new("props") if "props" not in bpy.data.collections else bpy.data.collections["props"]
    if col.name not in [c.name for c in scene.collection.children]:
        scene.collection.children.link(col)
    made = {}
    for i, (seed, h, lean) in enumerate([(11, 6.4, 0.7), (23, 5.4, 1.4), (37, 7.0, 0.3)]):
        o = palm(col, seed, height=h, lean=lean, name=f"palm-{i + 1}")
        o.location = (-7.5 + i * 3.6, 0, 0)
        made[o.name] = o
    for i, (seed, size, flat) in enumerate([(5, 1.0, 0.6), (8, 0.7, 0.75), (13, 1.5, 0.5)]):
        o = rock(col, seed, size=size, flat=flat, name=f"rock-{i + 1}")
        o.location = (-2.0 + i * 2.6, -4.2, 0.25 * size)
        made[o.name] = o
    for i, (seed, size, flowers) in enumerate([(31, 1.0, False), (47, 1.3, True), (59, 0.8, False)]):
        o = bush(col, seed, size=size, flowers=flowers, name=f"bush-{i + 1}")
        o.location = (-2.0 + i * 3.0, -8.2, 0)
        made[o.name] = o
    o = hut(col)
    o.location = (6.5, 2.0, 0)
    o.rotation_euler = (0, 0, math.pi - 0.5)
    made["hut"] = o
    # ground: sand disc on a flat sea
    bpy.ops.mesh.primitive_circle_add(vertices=40, radius=13, fill_type="NGON", location=(0, -0.5, -0.05))
    ground = bpy.context.object
    ground.name = "sand"
    ground.data.materials.append(lib.mat("c" + f"{int(PAL['sand']['dry']):06x}", int(PAL["sand"]["dry"]), 0.95))
    for c in list(ground.users_collection):
        c.objects.unlink(ground)
    col.objects.link(ground)
    # world and light
    world = bpy.data.worlds.get("props-world") or bpy.data.worlds.new("props-world")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.62, 0.78, 0.95, 1)
    bg.inputs["Strength"].default_value = 0.9
    scene.world = world
    sun_data = bpy.data.lights.new("props-sun", "SUN")
    sun_data.energy = 3.2
    sun_data.color = (1.0, 0.86, 0.72)
    sun = bpy.data.objects.new("props-sun", sun_data)
    sun.rotation_euler = (math.radians(55), 0, math.radians(35))
    scene.collection.objects.link(sun)
    cam_data = bpy.data.cameras.new("props-cam")
    cam_data.lens = 42
    cam = bpy.data.objects.new("props-cam", cam_data)
    cam.location = (1.5, -30.0, 8.5)
    scene.collection.objects.link(cam)
    direction = Vector((0.5, -1.0, 2.9)) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.engine = "BLENDER_EEVEE"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.resolution_x, scene.render.resolution_y = 1600, 800
    return made


def render(path):
    scene = bpy.data.scenes["Props"]
    bpy.context.window.scene = scene
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True, scene="Props")
    return path


def export_glb(out_dir):
    scene = bpy.data.scenes["Props"]
    bpy.context.window.scene = scene
    done = []
    for name in ("palm-1", "palm-2", "palm-3", "rock-1", "rock-2", "rock-3", "bush-1", "bush-2", "bush-3", "hut"):
        o = scene.objects[name]
        loc = o.location.copy()
        rot = o.rotation_euler.copy()
        o.location = (0, 0, 0)
        o.rotation_euler = (0, 0, 0)
        lib.bake_colors(o)
        path = os.path.join(out_dir, f"{name}.glb")
        lib.export(path, [o])
        o.location, o.rotation_euler = loc, rot
        done.append((name, lib.triangles(o)))
    return done
