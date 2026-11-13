"""Fish-market vendors for the sea game (CONCEPT stage): Co Lan, Chu Tu and Ba Sau, three chibi
cats who dress like people.

Anthropomorphic cats with big heads and small bodies who stand upright behind a counter on a wooden
pier, no hats (the head carries each one's identity): Co Lan, a slim cream calico (coral áo bà ba,
teal apron); Chu Tu, the biggest, a ginger tabby (towel, yellow bib apron, boots); Ba Sau, the
smallest and roundest, a grey elder (lilac áo bà ba, money pouch). All three have squinty happy eyes.
Built from scratch with bmesh, one material per palette colour (so `lib.bake_colors` can bake them
to vertex colours like the island props), no textures, no rig. Fur marks are palette-colour shapes.
Each vendor is an empty `vendor-<id>` at the feet holding:

    <id>-body    torso, neck, legs, feet, apron, accessories (one mesh)
    <id>-head    cat head, face, ears, whiskers (origin at the neck pivot)
    <id>-arm.L   left arm and paw         (origin at the shoulder pivot, so it can wave)
    <id>-arm.R   right arm and paw
    <id>-tail    the tail                 (origin at its base, so it can sway)

Front is -Y, feet at the origin, Z up, metres. Like props.py it never calls `lib.reset()`: it adds
a NEW scene to the running Blender, driven through the Blender MCP:

    import sys; sys.path.insert(0, "/path/to/tools/blender")
    import importlib, vendors; importlib.reload(vendors)
    vendors.build_scene("Vendors"); vendors.render("/tmp/vendors.png")
    vendors.render_sheet("/tmp/vendors/")   # front, three-quarter, face, line-up, phone size, counter

Colours: every colour is a palette role (ROLES below, read from palette.json); the few derived
tones (blush, the apricot calico patch, pockets) are mixes of two palette colours, never new hex.
Tunable numbers live in SPECS (one dict per vendor).
"""
import math, os
import bpy, bmesh
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import lib

PAL = lib.PAL
PP = PAL["people"]
CL = PP["clothes"]


def lerp(a, b, t):
    return a + (b - a) * t


def mix_hex(a, b, t):
    ca = [(a >> 16) & 255, (a >> 8) & 255, a & 255]
    cb = [(b >> 16) & 255, (b >> 8) & 255, b & 255]
    c = [round(lerp(x, y, t)) for x, y in zip(ca, cb)]
    return (c[0] << 16) | (c[1] << 8) | c[2]


# ------------------------------------------------------------------------------------------------
# Colour roles (palette only)
# ------------------------------------------------------------------------------------------------
FACE = {
    "eye": PP["face"]["lash"],
    "glint": PP["face"]["white"],
    "mouth": PP["face"]["lipDeep"],
    "pink": PAL["plants"]["flowers"][2],     # inner ears, nose, toe beans, tongue
    "blushTint": PAL["paint"]["coral"],
}
ROLES = {
    "lan": {
        "fur": PAL["paint"]["cream"], "muzzle": PAL["paint"]["white"],
        "patch": mix_hex(PAL["paint"]["crate"], PAL["plants"]["flowers"][3], 0.5), "patchDark": PP["hair"]["dark"], "iris": PAL["stone"]["moss"],
        "brow": PAL["wood"]["mid"], "whisker": PP["hair"]["grey"],
        "blouse": CL["scarfCoral"], "apron": CL["apronTeal"], "trousers": CL["blackPants"],
        "sandal": CL["sandal"],
    },
    "tu": {
        "fur": PAL["fit"]["winch"], "stripe": PAL["paint"]["redDeep"], "muzzle": PAL["paint"]["creamWarm"],
        "iris": PAL["gull"]["beak"], "whisker": PAL["paint"]["creamWarm"],
        "shirt": CL["fisherShirt"], "trousers": CL["fisherPants"],
        "apron": PAL["crew"]["coat"], "boots": PAL["fit"]["boots"], "sole": PAL["fit"]["rubber"],
        "towel": PAL["paint"]["white"],
    },
    "sau": {
        "fur": PAL["stone"]["rock"], "stripe": PAL["stone"]["dark"], "muzzle": PAL["paint"]["white"],
        "brow": PAL["paint"]["white"], "whisker": PAL["paint"]["white"],
        "mitten": PAL["paint"]["white"],
        "blouse": CL["babaLilac"], "trousers": CL["blackPants"],
        "sandal": CL["sandal"], "pouch": CL["babaMustard"], "strap": PAL["fit"]["belt"],
    },
}

# ------------------------------------------------------------------------------------------------
# Tunable numbers. Torso profile rows: (z, rx, ry, dy) from the hem up to the neck.
# ------------------------------------------------------------------------------------------------
SPECS = {
    # head: built at "c"/"r" then scaled by "scale" about the chin (c.z - 0.92 * r.z): the chibi head.
    "lan": {
        "zs": 1.25,  # body heights below are multiplied by this (the chin then clears a 0.55 m counter)
        "head": {"c": (0.0, -0.005, 0.692), "r": (0.118, 0.104, 0.100), "jaw": 0.84, "scale": 2.9, "muzzle": 0.95,
                 "seg": 28, "rings": 16, "markSoft": 0.0},
        "ears": {"x": 0.50, "h": 0.078, "w": 0.036, "splay": 0.30},
        "neck": (0.44, 0.52, 0.045),
        "torso": [(0.20, 0.150, 0.112, 0.0), (0.28, 0.140, 0.104, 0.0), (0.35, 0.122, 0.092, 0.0),
                  (0.41, 0.128, 0.096, -0.006), (0.46, 0.120, 0.086, 0.0), (0.495, 0.085, 0.062, 0.0), (0.515, 0.040, 0.035, 0.0)],
        "hip": 0.062, "legTop": 0.26, "knee": 0.16, "ankle": 0.075, "legR": (0.064, 0.060, 0.060),
        "shoulder": (0.098, 0.0, 0.445), "elbow": (0.150, 0.02, 0.355), "wrist": (0.138, -0.075, 0.275),
        "sleeve": (0.040, 0.037, 0.035), "hand": 1.0,
        "eyes": {"x": 0.048, "z": -0.006, "w": 0.018, "h": 0.007},
        "tail": [(0.0, 0.09, 0.28), (0.06, 0.20, 0.22), (0.16, 0.32, 0.25), (0.26, 0.39, 0.36), (0.33, 0.37, 0.46), (0.35, 0.31, 0.51)],
        "tailR": (0.026, 0.018),
    },
    "tu": {
        "zs": 1.17,
        "head": {"c": (0.0, -0.01, 0.716), "r": (0.130, 0.110, 0.104), "jaw": 0.92, "scale": 3.1, "muzzle": 1.1},
        "ears": {"x": 0.60, "h": 0.062, "w": 0.042, "splay": 0.42},
        "neck": (0.48, 0.56, 0.060),
        "torso": [(0.22, 0.172, 0.140, 0.0), (0.29, 0.182, 0.150, -0.006), (0.37, 0.188, 0.168, -0.028),
                  (0.44, 0.180, 0.145, -0.012), (0.50, 0.150, 0.112, 0.0), (0.535, 0.090, 0.070, 0.0), (0.55, 0.040, 0.035, 0.0)],
        "hip": 0.078, "legTop": 0.28, "knee": 0.17, "ankle": 0.07, "legR": (0.072, 0.066, 0.062),
        "shoulder": (0.140, 0.0, 0.475), "elbow": (0.200, 0.025, 0.375), "wrist": (0.185, -0.085, 0.295),
        "sleeve": (0.050, 0.046, 0.040), "hand": 1.12,
        "eyes": {"x": 0.050, "z": -0.002, "w": 0.018, "h": 0.008},
        "boot": 0.20,
        "tail": [(0.0, 0.13, 0.30), (-0.12, 0.25, 0.26), (-0.26, 0.27, 0.33), (-0.33, 0.19, 0.46), (-0.34, 0.09, 0.57), (-0.30, 0.04, 0.63)],
        "tailR": (0.036, 0.025),
    },
    "sau": {
        "zs": 1.49,
        "head": {"c": (0.0, -0.03, 0.680), "r": (0.126, 0.110, 0.098), "jaw": 0.94, "scale": 2.85, "muzzle": 1.05},
        "ears": {"x": 0.60, "h": 0.058, "w": 0.040, "splay": 0.62},
        "neck": (0.38, 0.44, 0.060),
        "torso": [(0.17, 0.215, 0.172, 0.0), (0.21, 0.240, 0.188, -0.006), (0.27, 0.250, 0.196, -0.016),
                  (0.33, 0.232, 0.182, -0.018), (0.38, 0.192, 0.152, -0.020), (0.415, 0.135, 0.108, -0.020),
                  (0.435, 0.060, 0.050, -0.020)],
        "hip": 0.075, "legTop": 0.20, "knee": 0.13, "ankle": 0.075, "legR": (0.070, 0.068, 0.066),
        "shoulder": (0.150, -0.02, 0.375), "elbow": (0.222, -0.005, 0.290), "wrist": (0.200, -0.110, 0.225),
        "sleeve": (0.048, 0.045, 0.043), "hand": 1.0,
        "eyes": {"x": 0.048, "z": -0.004, "w": 0.016, "h": 0.009},
        "tail": [(0.0, 0.15, 0.22), (0.12, 0.25, 0.16), (0.25, 0.22, 0.11), (0.32, 0.10, 0.12), (0.31, -0.01, 0.18)],
        "tailR": (0.044, 0.033),
    },
}


def body_spec(key):
    """SPECS[key] with every body height multiplied by its "zs" (the head keeps its own numbers)."""
    S = dict(SPECS[key])
    k = S.get("zs", 1.0)
    S["torso"] = [(z * k, rx, ry, dy) for z, rx, ry, dy in S["torso"]]
    n0, n1, nr = S["neck"]
    S["neck"] = (n0 * k, n1 * k, nr)
    for name in ("legTop", "knee", "boot"):
        if name in S:
            S[name] = S[name] * k
    for name in ("shoulder", "elbow", "wrist"):
        x, y, z = S[name]
        S[name] = (x, y, z * k)
    S["tail"] = [(x, y, z * k) for x, y, z in S["tail"]]
    S["Z"] = lambda v: v * k
    return S


# ------------------------------------------------------------------------------------------------
# Mesh helper
# ------------------------------------------------------------------------------------------------
def pmat(name, hexint, rough=0.85):
    """The one material for a palette colour: reuse `name` if it already exists with that hex (so no
    'c123456.001' duplicates appear when lib's cache was reset), else make it with lib.mat."""
    m = bpy.data.materials.get(name)
    if m is not None and int(m.get("hex", -1)) == int(hexint):
        return m
    return lib.mat(name, hexint, rough)


def dedupe_materials(scene):
    """Point every slot that uses a suffixed duplicate ('c123456.004') at its base material with the
    same hex, then drop duplicates nothing uses any more."""
    import re
    pat = re.compile(r"^(c[0-9a-f]{6})\.\d{3}$")
    for o in scene.objects:
        if o.type != "MESH":
            continue
        for i, m in enumerate(o.data.materials):
            hit = pat.match(m.name) if m else None
            if hit:
                base = bpy.data.materials.get(hit.group(1))
                if base is not None and int(base.get("hex", -1)) == int(m.get("hex", -2)):
                    o.data.materials[i] = base
    for m in list(bpy.data.materials):
        if pat.match(m.name) and m.users == 0:
            bpy.data.materials.remove(m)


class Mesh:
    """A bmesh being built with one material per colour; `smooth` sets the shading of new faces."""

    def __init__(self, name, smooth=False):
        self.name = name
        self.bm = bmesh.new()
        self.mats = []
        self.smooth = smooth

    def slot(self, hexint):
        key = f"c{hexint:06x}"
        for i, (n, _) in enumerate(self.mats):
            if n == key:
                return i
        self.mats.append((key, hexint))
        return len(self.mats) - 1

    def v(self, p):
        return self.bm.verts.new(Vector(p))

    def face(self, verts, hexint):
        try:
            f = self.bm.faces.new(verts)
        except ValueError:
            return None
        f.material_index = self.slot(hexint)
        f.smooth = self.smooth
        return f

    def tube(self, rings, hexint, cap0=None, cap1=None, loop=False):
        """Loft rings of points (each counter-clockwise about the travel direction): normals face out.
        `hexint` is one colour or a list with one colour per band."""
        vr = [[self.v(p) for p in ring] for ring in rings]
        cols = hexint if isinstance(hexint, (list, tuple)) else [hexint] * len(vr)
        pairs = list(zip(range(len(vr)), range(1, len(vr))))
        if loop:
            pairs.append((len(vr) - 1, 0))
        for a, b in pairs:
            n = len(vr[a])
            for j in range(n):
                k = (j + 1) % n
                self.face((vr[a][j], vr[a][k], vr[b][k], vr[b][j]), cols[min(a, len(cols) - 1)])
        if cap0 is not None:
            c = self.v(cap0)
            n = len(vr[0])
            for j in range(n):
                self.face((c, vr[0][(j + 1) % n], vr[0][j]), cols[0])
        if cap1 is not None:
            c = self.v(cap1)
            n = len(vr[-1])
            for j in range(n):
                self.face((c, vr[-1][j], vr[-1][(j + 1) % n]), cols[-1])
        return vr

    def bvh(self):
        return BVHTree.FromBMesh(self.bm)

    def triangles(self):
        return sum(len(f.verts) - 2 for f in self.bm.faces)

    def object(self, collection, origin=(0, 0, 0)):
        o_ = Vector(origin)
        for vv in self.bm.verts:
            vv.co -= o_
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for n, h in self.mats:
            me.materials.append(pmat(n, h))
        o = bpy.data.objects.new(self.name, me)
        o.location = o_
        collection.objects.link(o)
        return o


# ------------------------------------------------------------------------------------------------
# Primitives
# ------------------------------------------------------------------------------------------------
def frame(t):
    t = t.normalized()
    up = Vector((0, 0, 1)) if abs(t.z) < 0.95 else Vector((1, 0, 0))
    u = t.cross(up).normalized()
    return u, t.cross(u)


def ellipsoid(m, c, r, hexint, seg=10, rings=7, rot=None, keep=None, jaw=1.0):
    """An ellipsoid (local z = rot's third column). `keep(u)` drops faces whose unit-sphere centre
    fails it (shells: hair, scarves). `jaw` < 1 narrows the lower half (a head)."""
    c = Vector(c)
    rot = rot or Matrix.Identity(3)

    def pt(phi, a):
        z = -math.cos(phi)
        s = math.sin(phi)
        k = 1.0 - (1.0 - jaw) * max(0.0, -z) ** 1.6 if jaw != 1.0 else 1.0
        return Vector((s * math.cos(a) * k, s * math.sin(a) * (0.5 + 0.5 * k), z))

    def world(u):
        return c + rot @ Vector((u.x * r[0], u.y * r[1], u.z * r[2]))

    grid = []
    for i in range(1, rings):
        phi = math.pi * i / rings
        grid.append([pt(phi, math.tau * j / seg - math.pi / 2) for j in range(seg)])
    south, north = Vector((0, 0, -1)), Vector((0, 0, 1))
    vs = [[m.v(world(u)) for u in row] for row in grid]
    vsouth, vnorth = m.v(world(south)), m.v(world(north))

    def ok(units):
        if keep is None:
            return True
        cen = sum(units, Vector()) / len(units)
        return keep(cen)

    for i in range(len(grid) - 1):
        for j in range(seg):
            k = (j + 1) % seg
            if ok([grid[i][j], grid[i][k], grid[i + 1][k], grid[i + 1][j]]):
                m.face((vs[i][j], vs[i][k], vs[i + 1][k], vs[i + 1][j]), hexint)
    for j in range(seg):
        k = (j + 1) % seg
        if ok([south, grid[0][j], grid[0][k]]):
            m.face((vsouth, vs[0][k], vs[0][j]), hexint)
        if ok([north, grid[-1][j], grid[-1][k]]):
            m.face((vnorth, vs[-1][j], vs[-1][k]), hexint)
    # drop the vertices no face uses (cut shells)
    loose = [vv for vv in m.bm.verts if not vv.link_faces]
    bmesh.ops.delete(m.bm, geom=loose, context="VERTS")


def sweep_rings(path, radii, sides, axis=None, phase=0.0):
    """Rings around a polyline. radii: one per point, a number or (r_u, r_v). `axis(p, t)` gives the
    ring's u axis (the r_u direction); otherwise a parallel-transported frame."""
    path = [Vector(p) for p in path]
    n = len(path)
    rings, prev = [], None
    for i, p in enumerate(path):
        t = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        if axis is not None:
            h = Vector(axis(p, t))
            u = (h - t * h.dot(t)).normalized()
        elif prev is None:
            u, _ = frame(t)
        else:
            u = (prev - t * prev.dot(t)).normalized()
        prev = u
        v = t.cross(u)
        r = radii[i]
        ru, rv = (r, r) if not isinstance(r, (tuple, list)) else r
        rings.append([p + u * (ru * math.cos(a)) + v * (rv * math.sin(a))
                      for a in (math.tau * j / sides + phase for j in range(sides))])
    return rings


def sweep(m, path, radii, hexint, sides=6, caps=True, axis=None, loop=False):
    rings = sweep_rings(path, radii, sides, axis)
    return m.tube(rings, hexint, cap0=Vector(path[0]) if caps and not loop else None,
                  cap1=Vector(path[-1]) if caps and not loop else None, loop=loop)


def smooth_path(pts, steps=3):
    """Catmull-Rom through the points (rounder limbs and straps)."""
    pts = [Vector(p) for p in pts]
    out = []
    for i in range(len(pts) - 1):
        p0, p1, p2 = pts[max(i - 1, 0)], pts[i], pts[i + 1]
        p3 = pts[min(i + 2, len(pts) - 1)]
        for s in range(steps):
            t = s / steps
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t))
    out.append(pts[-1])
    return out


def profile_at(profile, z):
    """(rx, ry, dy) of a torso profile at height z (clamped)."""
    if z <= profile[0][0]:
        return profile[0][1:]
    for a, b in zip(profile, profile[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / (b[0] - a[0])
            return tuple(lerp(x, y, t) for x, y in zip(a[1:], b[1:]))
    return profile[-1][1:]


def lathe(m, profile, hexint, sides=16, cap0=False, cap1=True, grow=0.0):
    rings = []
    for z, rx, ry, dy in profile:
        rings.append([Vector(((rx + grow) * math.cos(a), dy + (ry + grow) * math.sin(a), z))
                      for a in (math.tau * j / sides - math.pi / 2 for j in range(sides))])
    top = profile[-1]
    return m.tube(rings, hexint, cap0=Vector((0, profile[0][3], profile[0][0])) if cap0 else None,
                  cap1=Vector((0, top[3], top[0])) if cap1 else None)


def panel(m, profile, z0, z1, half, hexint, gap=0.012, nx=6, nz=6, back=True, bulge=None, cx=0.0):
    """A cloth panel on the front of a torso profile (aprons): follows its ellipse, hangs straight
    below it. `half(t)` is the half width at t in [0, 1] from z0 to z1."""
    def at(x, z):
        rx, ry, dy = profile_at(profile, z)
        rx += gap
        ry += gap
        s = max(-0.97, min(0.97, x / rx))
        y = dy - ry * math.sqrt(1 - s * s)
        if bulge:
            y -= bulge(z)
        return Vector((x, y, z))

    grid = []
    for i in range(nz + 1):
        t = i / nz
        z = lerp(z0, z1, t)
        w = half(t)
        grid.append([at(cx + lerp(-w, w, j / nx), z) for j in range(nx + 1)])
    vs = [[m.v(p) for p in row] for row in grid]
    for i in range(nz):
        for j in range(nx):
            m.face((vs[i][j], vs[i][j + 1], vs[i + 1][j + 1], vs[i + 1][j]), hexint)
    if back:
        bs = [[m.v(p + Vector((0, 0.005, 0))) for p in row] for row in grid]
        for i in range(nz):
            for j in range(nx):
                m.face((bs[i][j], bs[i + 1][j], bs[i + 1][j + 1], bs[i][j + 1]), hexint)
        # close the hem so it reads as cloth with thickness
        for j in range(nx):
            m.face((vs[0][j], bs[0][j], bs[0][j + 1], vs[0][j + 1]), hexint)
    return at


# ------------------------------------------------------------------------------------------------
# Face features: patches projected onto the head along +Y
# ------------------------------------------------------------------------------------------------
class Face:
    def __init__(self, m, c, r=None):
        self.m = m
        self.c = Vector(c)
        self.r = r
        self.tree = m.bvh()

    def hit(self, x, z):
        """The surface point seen from the front at (x, z) from the head centre; past the silhouette
        it falls back to a ray towards the centre, so marks can wrap round the sides."""
        loc, nor, _, _ = self.tree.ray_cast(Vector((self.c.x + x, self.c.y - 1.0, self.c.z + z)),
                                             Vector((0, 1, 0)))
        if loc is None and self.r:
            rx, ry, rz = self.r
            ux, uz = x / rx, z / rz
            uy = -math.sqrt(max(0.0, 1 - ux * ux - uz * uz))
            d = Vector((ux * rx, uy * ry, uz * rz)).normalized()
            loc, nor, _, _ = self.tree.ray_cast(self.c + d, -d)
        return (loc, nor) if loc is not None else (None, None)

    def blob(self, cx, cz, w, h, hexint, lift=0.0015, dome=0.0, rot=0.0, n=10):
        """A filled ellipse (eyes, blush, glints), domed in the middle."""
        rim = []
        for j in range(n):
            a = math.tau * j / n
            x, z = w * math.cos(a), h * math.sin(a)
            x, z = x * math.cos(rot) - z * math.sin(rot), x * math.sin(rot) + z * math.cos(rot)
            loc, nor = self.hit(cx + x, cz + z)
            if loc is None:
                return
            rim.append(self.m.v(loc + nor * lift))
        loc, nor = self.hit(cx, cz)
        c = self.m.v(loc + nor * (lift + dome))
        for j in range(n):
            self.m.face((c, rim[j], rim[(j + 1) % n]), hexint)

    def arc(self, cx, cz, w, bend, th, hexint, lift=0.0018, tilt=0.0, taper=0.4, drop=0.0, n=7):
        """A curved stroke (brows, smiles, closed eyes, lash lines). bend > 0 lifts the ends,
        `drop` fattens the middle downward (an open smile)."""
        lo, up = [], []
        for i in range(n):
            t = -1 + 2 * i / (n - 1)
            zc = cz + bend * t * t + tilt * t
            h = th * (taper + (1 - taper) * (1 - t * t))
            for z, side in ((zc - h - drop * (1 - t * t), lo), (zc + h, up)):
                loc, nor = self.hit(cx + w * t, z)
                if loc is None:
                    return
                side.append(self.m.v(loc + nor * lift))
        for i in range(n - 1):
            self.m.face((lo[i], lo[i + 1], up[i + 1], up[i]), hexint)

    def nose(self, cz, r, hexint, out=0.55):
        loc, nor = self.hit(0.0, cz)
        if loc is None:
            return
        ellipsoid(self.m, loc + nor * r[1] * out, r, hexint, seg=8, rings=5)

    def poly(self, pts, hexint, lift=0.0018, dome=0.0):
        """A filled convex outline of (x, z) points, counter-clockwise seen from the front."""
        rim = []
        for x, z in pts:
            loc, nor = self.hit(x, z)
            if loc is None:
                return
            rim.append(self.m.v(loc + nor * lift))
        cx = sum(p[0] for p in pts) / len(pts)
        cz = sum(p[1] for p in pts) / len(pts)
        loc, nor = self.hit(cx, cz)
        c = self.m.v(loc + nor * (lift + dome))
        for j in range(len(rim)):
            self.m.face((c, rim[j], rim[(j + 1) % len(rim)]), hexint)

    def stroke(self, pts, width, hexint, lift=0.0018, taper=0.35, step=0.008):
        """A tapered stroke along (x, z) points (tabby stripes, brows, mouth lines), resampled so
        it hugs the curved head."""
        dense = [pts[0]]
        for a, b in zip(pts, pts[1:]):
            k = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) / step))
            dense += [(lerp(a[0], b[0], i / k), lerp(a[1], b[1], i / k)) for i in range(1, k + 1)]
        pts = dense
        n = len(pts)
        lo, up = [], []
        for i, (x, z) in enumerate(pts):
            a, b = pts[max(i - 1, 0)], pts[min(i + 1, n - 1)]
            dx, dz = b[0] - a[0], b[1] - a[1]
            L = math.hypot(dx, dz) or 1.0
            px, pz = -dz / L, dx / L
            w = width * (taper + (1 - taper) * math.sin(math.pi * i / (n - 1)))
            for (xx, zz), side in (((x - px * w, z - pz * w), lo), ((x + px * w, z + pz * w), up)):
                loc, nor = self.hit(xx, zz)
                if loc is None:
                    return
                side.append(self.m.v(loc + nor * lift))
        for i in range(n - 1):
            self.m.face((lo[i], lo[i + 1], up[i + 1], up[i]), hexint)


def oface(m, verts, hexint, centre):
    """A face turned to look away from `centre`."""
    f = m.face(verts, hexint)
    if f is not None:
        f.normal_update()
        if f.normal.dot(f.calc_center_median() - centre) < 0:
            f.normal_flip()
    return f


def disc(m, c, normal, r, hexint, n=6):
    """A small flat disc facing `normal` (toe beans)."""
    nrm = Vector(normal).normalized()
    u, v = frame(nrm)
    c = Vector(c)
    ring = [m.v(c + u * (r * math.cos(math.tau * j / n)) + v * (r * math.sin(math.tau * j / n))) for j in range(n)]
    cv = m.v(c)
    for j in range(n):
        oface(m, (cv, ring[j], ring[(j + 1) % n]), hexint, c - nrm)


def cat_head(name, spec, fur, muzzle, marks=()):
    """A wide round cat head with two whisker pads and a small chin; returns (mesh, face, c, r).
    `marks` are fur patches painted onto the head's own faces: (direction, angle in degrees, colour)
    = every face whose centre lies within that angle of the direction (in unit-sphere space)."""
    hs = spec["head"]
    m = Mesh(name, smooth=True)
    c = Vector(hs["c"])
    rx, ry, rz = hs["r"]
    ellipsoid(m, c, (rx, ry, rz), fur, seg=hs.get("seg", 20), rings=hs.get("rings", 12), jaw=hs["jaw"])
    soft = hs.get("markSoft", 0.0)
    for d, ang, hexint in marks:
        d = Vector(d).normalized()
        lim = math.cos(math.radians(ang))
        edge = math.cos(math.radians(ang + soft))
        for fc in m.bm.faces:
            q = fc.calc_center_median() - c
            u = Vector((q.x / rx, q.y / ry, q.z / rz)).normalized()
            if u.dot(d) > lim:
                fc.material_index = m.slot(hexint)
            elif soft and u.dot(d) > edge:  # a half-tone ring softens the faceted edge
                fc.material_index = m.slot(mix_hex(hexint, fur, 0.5))
    k = hs.get("muzzle", 1.0)
    for s in (-1, 1):
        ellipsoid(m, c + Vector((s * 0.021 * k, -ry * 0.84, -rz * 0.36)), (0.027 * k, 0.022 * k, 0.022 * k),
                  muzzle, seg=8, rings=5)
    ellipsoid(m, c + Vector((0, -ry * 0.76, -rz * 0.62)), (0.020 * k, 0.016 * k, 0.013 * k), muzzle, seg=8, rings=4)
    return m, Face(m, c, (rx, ry, rz)), c, (rx, ry, rz)


def ear(m, c, r, s, E, outer, inner):
    """A tall triangular ear on the top of the head (side s), with a pink inside."""
    ux = E["x"]
    uz = math.sqrt(max(0.05, 1 - ux * ux)) * 0.93
    base = c + Vector((s * ux * r[0], 0.004, uz * r[2]))
    d = Vector((s * E["splay"], 0.06, 1)).normalized()
    fwd = Vector((0, -1, 0))
    right = d.cross(fwd).normalized()
    th = Vector((0, E["w"] * 0.32, 0))
    B = base - d * 0.02
    tip = base + d * E["h"]
    Lf, Rf = B - right * E["w"] - th, B + right * E["w"] - th
    Lb, Rb = B - right * E["w"] + th, B + right * E["w"] + th
    centre = B + d * (E["h"] * 0.25)
    old = m.smooth
    m.smooth = False
    vs = {k: m.v(p) for k, p in (("Lf", Lf), ("Rf", Rf), ("Lb", Lb), ("Rb", Rb), ("A", tip))}
    for keys in (("Lf", "Rf", "A"), ("Rb", "Lb", "A"), ("Lb", "Lf", "A"), ("Rf", "Rb", "A"), ("Lf", "Lb", "Rb", "Rf")):
        oface(m, [vs[k] for k in keys], outer, centre)
    ctr = (Lf + Rf + tip) / 3
    nrm = (Rf - Lf).cross(tip - Lf).normalized()
    if nrm.y > 0:
        nrm = -nrm
    pts = [ctr + (p - ctr) * 0.66 + nrm * 0.003 + d * 0.004 for p in (Lf, Rf, tip)]
    oface(m, [m.v(p) for p in pts], inner, ctr - nrm)
    m.smooth = old


def whiskers(m, f, hexint, spread=0.052):
    """Three short straight whiskers per side, flat strips (wide in the view) from the whisker pad."""
    old = m.smooth
    m.smooth = False
    for s in (-1, 1):
        loc, nor = f.hit(s * 0.030, -0.034)
        if loc is None:
            continue
        for dz in (0.010, 0.0, -0.010):
            root = loc - nor * 0.004
            end = loc + Vector((s * spread, 0.004, dz * 1.6))
            sweep(m, [root, end], [(0.0016, 0.0032), (0.0008, 0.0016)], hexint, sides=4,
                  axis=lambda p, t: Vector((0, 1, 0)))
    m.smooth = old


def grow_head(spec, *meshes):
    """Stylise: scale the finished head (and anything passed with it) about the chin by spec['head']['scale']."""
    hs = spec["head"]
    c = Vector(hs["c"])
    k = hs.get("scale", 1.0)
    pivot = Matrix.Translation(c + Vector((0, 0, -hs["r"][2] * 0.92)))
    mat = pivot @ Matrix.Scale(k, 4) @ pivot.inverted()
    for m in meshes:
        bmesh.ops.transform(m.bm, matrix=mat, verts=m.bm.verts[:])


def paw(m, wrist, f, n, side, k, fur, bean):
    """A soft cat paw: round pad, four short fingers, a thumb, pink toe beans on the palm side.
    f = finger direction, n = the way the palm faces, side = +1/-1 puts the thumb on the n x f side."""
    f = Vector(f).normalized()
    n = (Vector(n) - f * Vector(n).dot(f)).normalized()
    s = n.cross(f)
    rot = Matrix((s, n, f)).transposed()
    w = Vector(wrist)
    ellipsoid(m, w + f * 0.036 * k, (0.034 * k, 0.024 * k, 0.040 * k), fur, seg=8, rings=6, rot=rot)
    for off in (-0.020, -0.0068, 0.0068, 0.020):
        base = w + f * 0.060 * k + s * (off * side * k)
        L = 0.030 * k
        tip = base + f * L * 0.55 + n * L * 0.45
        sweep(m, [base, tip], [0.0110 * k, 0.0095 * k], fur, sides=5)
        td = (tip - base).normalized()
        disc(m, tip + td * 0.0008, td, 0.0062 * k, bean, n=6)  # bean on the fingertip, seen from the front
    tb = w + f * 0.024 * k + s * (0.028 * side * k)
    tip = tb + s * (0.012 * side * k) + f * 0.020 * k + n * 0.010 * k
    sweep(m, [tb, tip], [0.0125 * k, 0.010 * k], fur, sides=5)
    disc(m, w + f * 0.040 * k + n * (0.0245 * k), n, 0.014 * k, bean, n=7)


def arm(name, spec, sleeve_hex, fur, paw_hex, bean, sleeve_end=1.0, cuff=False, bare=None, smooth=True):
    """Upper arm + forearm (sleeve to `sleeve_end` along the arm, 0..2: 1 = the elbow), paw.
    `bare` is the colour cycle of the furry forearm bands (tabby stripes); default plain fur."""
    sh, el, wr = Vector(spec["shoulder"]), Vector(spec["elbow"]), Vector(spec["wrist"])
    bare = bare or [fur]
    out = {}
    for side in (1, -1):  # +1: the vendor's left arm (+X), -1: the right arm
        S = sh * 1
        S.x *= side
        E = el * 1
        E.x *= side
        W = wr * 1
        W.x *= side
        mm = Mesh(f"{name}.{'L' if side > 0 else 'R'}", smooth=smooth)
        pts = smooth_path([S, E, W], steps=3)  # 7 points: 0..3 upper arm, 3..6 forearm
        r0, r1, r2 = spec["sleeve"]
        radii, cols = [], []
        nb = 0
        for i, p in enumerate(pts):
            t = i / 3.0  # 0 shoulder, 1 elbow, 2 wrist
            r = lerp(r0, r1, t) if t <= 1 else lerp(r1, r2, t - 1)
            if t > sleeve_end + 1e-6:
                r *= 0.82
                cols.append(bare[nb % len(bare)])
                nb += 1
            else:
                cols.append(sleeve_hex)
            radii.append(r)
        bands = [cols[i + 1] for i in range(len(pts) - 1)]  # band i joins point i and i + 1
        sweep(mm, pts, radii, bands, sides=10, caps=False)
        # the shoulder: a ball that sits mostly inside the torso, so the joint reads as one curve
        ellipsoid(mm, S + Vector((-side * 0.006, 0, -0.008)), (r0 * 1.0, r0 * 0.98, r0 * 0.98), sleeve_hex, seg=8, rings=5)
        if cuff:
            idx = int(sleeve_end * 3)
            p = pts[idx]
            t = (pts[idx + 1] - pts[idx - 1]).normalized()
            sweep(mm, [p - t * 0.014, p + t * 0.014], [radii[idx] * 1.28, radii[idx] * 1.28], sleeve_hex, sides=10)
        d = (W - pts[-2]).normalized()
        ellipsoid(mm, W, (radii[-1] * 0.95,) * 3, paw_hex, seg=6, rings=4)
        paw(mm, W - d * 0.005, d + Vector((0, -0.25, -0.1)), Vector((-side, 0.15, 0)), side, spec["hand"], paw_hex, bean)
        out[side] = (mm, S)
    return out


def sandals(m, spec, fur, sandal_hex):
    """Furry cat feet with three toes on flat sandals."""
    for s in (-1, 1):
        x = s * (spec["hip"] + 0.005)
        ellipsoid(m, (x, -0.040, 0.034), (0.044, 0.090, 0.032), fur, seg=10, rings=6)
        for i in (-1, 0, 1):
            ellipsoid(m, (x + i * 0.022, -0.118, 0.026), (0.014, 0.018, 0.016), fur, seg=6, rings=3)
        ellipsoid(m, (x, -0.048, 0.010), (0.052, 0.110, 0.010), sandal_hex, seg=12, rings=4)
        arc = [(x - 0.046, -0.070, 0.012), (x - 0.032, -0.073, 0.048), (x, -0.075, 0.060),
               (x + 0.032, -0.073, 0.048), (x + 0.046, -0.070, 0.012)]
        sweep(m, smooth_path(arc, 2), [(0.012, 0.004)] * 9, sandal_hex, sides=4,
              axis=lambda p, t: Vector((0, 1, 0)))


def tail(name, spec, colour_at):
    """A tail swept along spec['tail'] (base first), tapering from tailR[0] to tailR[1] with a
    rounded tip; colour_at(t) colours the band at t in [0, 1]."""
    m = Mesh(name, smooth=False)
    pts = smooth_path(spec["tail"], 2)
    r0, r1 = spec["tailR"]
    n = len(pts)
    radii = [lerp(r0, r1, i / (n - 1)) for i in range(n)]
    sweep(m, pts, radii, [colour_at(i / (n - 2)) for i in range(n - 1)], sides=7, caps=True)
    ellipsoid(m, pts[-1], (r1, r1, r1), colour_at(1.0), seg=7, rings=4)
    return m, Vector(spec["tail"][0])


def buttons(m, profile, zs, hexint):
    """A row of small buttons down the front of a blouse."""
    for z in zs:
        rx, ry, dy = profile_at(profile, z)
        ellipsoid(m, (0.0, dy - ry - 0.002, z), (0.008, 0.005, 0.008), hexint, seg=6, rings=4)


def legs(m, spec, trousers_hex, z_bottom, flare=0.0):
    for s in (-1, 1):
        x = s * spec["hip"]
        r0, r1, r2 = spec["legR"]
        path = [(x * 0.92, 0.0, spec["legTop"]), (x, 0.0, lerp(spec["legTop"], spec["knee"], 0.5)),
                (x, 0.0, spec["knee"]), (x * 1.02, 0.005, lerp(spec["knee"], z_bottom, 0.5)), (x * 1.03, 0.005, z_bottom)]
        radii = [r0, lerp(r0, r1, 0.5), r1, lerp(r1, r2, 0.5), r2 + flare]
        sweep(m, path, radii, trousers_hex, sides=10, caps=True)


# ------------------------------------------------------------------------------------------------
# Vendors
# ------------------------------------------------------------------------------------------------
def cat_mouth(f, mouth, nose_hex, w=0.018, nz=-0.018):
    """Small triangular nose, a short line down and a small soft 'w' mouth."""
    f.poly([(-0.010, nz), (0.0, nz - 0.011), (0.010, nz)], nose_hex, lift=0.003, dome=0.003)
    f.stroke([(0.0, nz - 0.011), (0.0, nz - 0.020)], 0.0020, mouth, taper=0.8)
    f.stroke([(-w, nz - 0.017), (-w * 0.5, nz - 0.026), (0.0, nz - 0.020)], 0.0021, mouth, taper=0.6)
    f.stroke([(0.0, nz - 0.020), (w * 0.5, nz - 0.026), (w, nz - 0.017)], 0.0021, mouth, taper=0.6)


def happy_eye(f, s, E, style):
    """Squinty happy eyes. 'crescent': a soft smiling crescent with a lash flick and a tiny glint
    (Lan); 'grin': a thick cheeky squint with laugh lines (Tu); 'closed': a sharp ^ (Sau)."""
    ex, z, w, h = s * E["x"], E["z"], E["w"], E["h"]
    if style == "crescent":
        f.arc(ex, z, w, -h, 0.0034, FACE["eye"], lift=0.0024, taper=0.3, drop=0.0)
        f.stroke(sorted([(ex + s * w * 0.92, z - h * 0.92), (ex + s * (w + 0.008), z - h * 0.55)]), 0.0018, FACE["eye"], lift=0.0024)
        f.blob(ex - s * 0.005, z + 0.0005, 0.0026, 0.0026, FACE["glint"], lift=0.0040, n=6)
    elif style == "grin":
        f.arc(ex, z, w, -h * 0.8, 0.0048, FACE["eye"], lift=0.0024, taper=0.45, tilt=s * 0.0025)
        f.blob(ex - s * 0.005, z + 0.0012, 0.0026, 0.0026, FACE["glint"], lift=0.0044, n=6)
    else:
        f.stroke([(ex - w, z - h), (ex, z + h), (ex + w, z - h)], 0.0030, FACE["eye"], lift=0.0024, taper=0.5)


def blush(f, s, x, z, fur, k=0.5, w=0.024, h=0.013):
    f.blob(s * x, z, w, h, mix_hex(fur, FACE["blushTint"], k), lift=0.0030)


def build_lan(col):
    """Co Lan: a small slim cream calico with a big round head. Tall ears, one orange-apricot and
    one black, an apricot patch over her left eye, soft smiling crescent eyes, a tiny 'w' mouth;
    coral ao ba ba, teal half apron, black trousers, sandals; a long banded tail curling up."""
    R, S = ROLES["lan"], body_spec("lan")
    Z = S["Z"]
    body = Mesh("lan-body", smooth=False)
    lathe(body, S["torso"], R["blouse"], sides=16, cap0=True)
    n0, n1, nr = S["neck"]
    sweep(body, [(0, 0.0, n0), (0, -0.004, n1)], [nr * 1.1, nr], R["fur"], sides=10)
    legs(body, S, R["trousers"], 0.07, flare=0.008)
    sandals(body, S, R["fur"], R["sandal"])
    half = lambda t: lerp(0.142, 0.118, t)
    panel(body, S["torso"], Z(0.15), Z(0.375), half, R["apron"], gap=0.010, nx=6, nz=4)
    pocket = mix_hex(R["apron"], PP["hair"]["black"], 0.22)
    panel(body, S["torso"], Z(0.22), Z(0.29), lambda t: 0.06, pocket, gap=0.016, nx=4, nz=1, back=False)
    buttons(body, S["torso"], (Z(0.405), Z(0.445)), CL["button"])
    rx, ry, dy = profile_at(S["torso"], Z(0.375))
    lathe(body, [(Z(0.36), rx + 0.012, ry + 0.012, dy), (Z(0.385), rx + 0.012, ry + 0.012, dy)], R["apron"], sides=16, cap1=False)
    for s in (-1, 1):  # bow at the back
        rot = Matrix.Rotation(s * 0.5, 3, "Y")
        ellipsoid(body, (s * 0.024, ry + 0.02, Z(0.373)), (0.026, 0.011, 0.014), R["apron"], seg=8, rings=5, rot=rot)
    head, f, c, r = cat_head("lan-head", S, R["fur"], R["muzzle"],
                             marks=[((0.70, -0.40, 0.58), 34, R["patch"]), ((-0.55, 0.45, 0.70), 30, R["patchDark"]),
                                    ((0.2, 0.9, 0.2), 28, R["patch"])])
    E = S["eyes"]
    for s in (-1, 1):
        happy_eye(f, s, E, "crescent")
        f.stroke(sorted([(s * 0.036, E["z"] + 0.034), (s * 0.048, E["z"] + 0.038), (s * 0.060, E["z"] + 0.034)]),
                 0.0022, R["brow"], lift=0.002)
        blush(f, s, 0.074, -0.026, R["fur"], 0.5)
    cat_mouth(f, FACE["mouth"], mix_hex(FACE["pink"], FACE["mouth"], 0.35))
    whiskers(head, f, R["whisker"])
    ear(head, c, r, 1, S["ears"], R["patch"], FACE["pink"])
    ear(head, c, r, -1, S["ears"], R["patchDark"], FACE["pink"])
    grow_head(S, head)
    arms = arm("lan-arm", S, R["blouse"], R["fur"], R["fur"], FACE["pink"], sleeve_end=1.85)
    tl = tail("lan-tail", S, lambda t: R["fur"] if t < 0.62 else (R["patch"] if t < 0.84 else R["patchDark"]))
    return finish(col, "lan", body, head, arms, tl, c)


def build_tu(col):
    """Chu Tu: the biggest, a broad ginger tabby with a round belly and the widest head. Red-brown
    stripes on the brow, cheeks, forearms and tail, a cheeky grin squint with laugh lines and a small
    open grin; blue shirt with rolled sleeves, white towel, yellow bib apron, black boots."""
    R, S = ROLES["tu"], body_spec("tu")
    Z = S["Z"]
    body = Mesh("tu-body", smooth=False)
    lathe(body, S["torso"], R["shirt"], sides=16, cap0=True)
    n0, n1, nr = S["neck"]
    sweep(body, [(0, 0.0, n0), (0, -0.006, n1)], [nr * 1.1, nr], R["fur"], sides=10)
    legs(body, S, R["trousers"], S["boot"] - 0.02)
    for s in (-1, 1):  # rubber boots
        x = s * S["hip"] * 1.03
        sweep(body, [(x, 0.005, 0.05), (x, 0.005, S["boot"])], [0.064, 0.066], R["boots"], sides=12)
        sweep(body, [(x, 0.005, S["boot"] - 0.025), (x, 0.005, S["boot"] + 0.01)], [0.074, 0.076], R["boots"], sides=12)
        ellipsoid(body, (x, -0.045, 0.05), (0.060, 0.105, 0.05), R["boots"], seg=12, rings=6)
        ellipsoid(body, (x, -0.045, 0.013), (0.064, 0.11, 0.013), R["sole"], seg=12, rings=4)
    def half(t):
        return lerp(0.18, 0.16, t / 0.6) if t < 0.6 else lerp(0.16, 0.11, (t - 0.6) / 0.4)
    panel(body, S["torso"], Z(0.17), Z(0.50), half, R["apron"], gap=0.022, nx=6, nz=6)
    rx, ry, dy = profile_at(S["torso"], Z(0.38))
    lathe(body, [(Z(0.37), rx + 0.02, ry + 0.02, dy), (Z(0.39), rx + 0.02, ry + 0.02, dy)], R["apron"], sides=16, cap1=False)
    towel = [(x, y, Z(z)) for x, y, z in (
        (0.075, -0.150, 0.37), (0.085, -0.140, 0.45), (0.09, -0.080, 0.525), (0.065, 0.03, 0.555), (0.0, 0.07, 0.56),
        (-0.065, 0.03, 0.555), (-0.09, -0.080, 0.525), (-0.085, -0.140, 0.45), (-0.075, -0.150, 0.38))]
    def tw_axis(p, t):
        o = Vector((p.x, p.y + 0.01, 0)).normalized()
        return t.cross(o)
    sweep(body, smooth_path(towel, 2), [(0.036, 0.011)] * 17, R["towel"], sides=6, axis=tw_axis)
    head, f, c, r = cat_head("tu-head", S, R["fur"], R["muzzle"])
    for x in (-0.024, 0.0, 0.024):
        f.stroke([(x * 1.3, 0.085), (x, 0.040)], 0.0060, R["stripe"], lift=0.0015)
    E = S["eyes"]
    for s in (-1, 1):
        for z0 in (0.006, -0.016):
            f.stroke(sorted([(s * 0.088, z0), (s * 0.106, z0 - 0.002), (s * 0.122, z0 - 0.006)]), 0.0048, R["stripe"], lift=0.0015)
        happy_eye(f, s, E, "grin")
        f.stroke(sorted([(s * 0.034, E["z"] + 0.030), (s * 0.050, E["z"] + 0.034), (s * 0.066, E["z"] + 0.027)]),
                 0.0045, R["stripe"], lift=0.002)
        for k in (-1, 0, 1):  # laugh lines at the outer eye corners
            f.arc(s * (E["x"] + 0.030), E["z"] + k * 0.007, 0.006, 0.0, 0.0014, R["stripe"], tilt=s * k * 0.002, taper=0.8, n=3)
        blush(f, s, 0.076, -0.028, R["fur"], 0.35)
    nz = -0.017
    f.poly([(-0.012, nz), (0.0, nz - 0.013), (0.012, nz)], mix_hex(FACE["pink"], FACE["mouth"], 0.45), lift=0.003, dome=0.003)
    f.stroke([(0.0, nz - 0.013), (0.0, -0.034)], 0.0020, FACE["mouth"], taper=0.8)
    f.poly([(-0.022, -0.034), (-0.015, -0.046), (0.0, -0.052), (0.015, -0.046), (0.022, -0.034), (0.0, -0.036)],
           FACE["mouth"], lift=0.0022)                                          # small open grin
    f.blob(0.0, -0.046, 0.009, 0.005, FACE["pink"], lift=0.0034)               # tongue
    whiskers(head, f, R["whisker"], spread=0.058)
    for s in (-1, 1):
        ear(head, c, r, s, S["ears"], R["fur"], FACE["pink"])
    grow_head(S, head)
    arms = arm("tu-arm", S, R["shirt"], R["fur"], R["fur"], FACE["pink"], sleeve_end=0.92, cuff=True,
               bare=[R["fur"], R["stripe"]])
    tl = tail("tu-tail", S, lambda t: R["stripe"] if int(t * 9) % 2 == 1 or t > 0.95 else R["fur"])
    return finish(col, "tu", body, head, arms, tl, c)


def build_sau(col):
    """Ba Sau: the smallest and roundest, a plump grey elder. White muzzle, drooping white brows,
    closed ^ ^ eyes and rosy cheeks; lilac ao ba ba, a mustard money pouch on a
    strap, white paws and feet on sandals, a thick ringed tail with a white tip."""
    R, S = ROLES["sau"], body_spec("sau")
    Z = S["Z"]
    body = Mesh("sau-body", smooth=False)
    lathe(body, S["torso"], R["blouse"], sides=18, cap0=True)
    n0, n1, nr = S["neck"]
    sweep(body, [(0, -0.02, n0), (0, -0.025, n1)], [nr * 1.1, nr], R["fur"], sides=10)
    legs(body, S, R["trousers"], 0.07, flare=0.01)
    sandals(body, S, R["mitten"], R["sandal"])
    buttons(body, S["torso"], (Z(0.33), Z(0.375)), CL["button"])
    rx, ry, dy = profile_at(S["torso"], Z(0.27))
    lathe(body, [(Z(0.27), rx + 0.006, ry + 0.006, dy), (Z(0.285), rx + 0.006, ry + 0.006, dy)], R["strap"], sides=18, cap1=False)
    ellipsoid(body, (0.04, dy - ry - 0.022, Z(0.235)), (0.058, 0.028, 0.048), R["pouch"], seg=10, rings=6)
    ellipsoid(body, (0.04, dy - ry - 0.036, Z(0.265)), (0.060, 0.020, 0.018), mix_hex(R["pouch"], R["strap"], 0.35), seg=10, rings=4)
    head, f, c, r = cat_head("sau-head", S, R["fur"], R["muzzle"])
    for x in (-0.018, 0.0, 0.018):
        f.stroke([(x * 1.2, 0.080), (x, 0.050)], 0.0040, R["stripe"], lift=0.0015)
    E = S["eyes"]
    for s in (-1, 1):
        happy_eye(f, s, E, "closed")
        f.stroke(sorted([(s * 0.026, E["z"] + 0.034), (s * 0.046, E["z"] + 0.039), (s * 0.068, E["z"] + 0.026)]),
                 0.0058, R["brow"], lift=0.0022)                                    # drooping white brows
        blush(f, s, 0.074, -0.026, R["muzzle"], 0.55, w=0.026, h=0.015)
        f.stroke(sorted([(s * 0.092, 0.002), (s * 0.114, -0.002)]), 0.0035, R["stripe"], lift=0.0015)
    cat_mouth(f, FACE["mouth"], FACE["pink"])
    whiskers(head, f, R["whisker"])
    for s in (-1, 1):
        ear(head, c, r, s, S["ears"], R["fur"], FACE["pink"])
    grow_head(S, head)
    arms = arm("sau-arm", S, R["blouse"], R["fur"], R["mitten"], FACE["pink"], sleeve_end=1.55)
    tl = tail("sau-tail", S, lambda t: R["mitten"] if t > 0.9 else (R["stripe"] if int(t * 6) % 2 == 1 else R["fur"]))
    return finish(col, "sau", body, head, arms, tl, c)


def finish(col, key, body, head, arms, tl, head_c):
    """Turn the meshes into objects under an empty `vendor-<key>` with the pivots described above."""
    root = bpy.data.objects.new(f"vendor-{key}", None)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.2
    col.objects.link(root)
    S = SPECS[key]
    tm, tbase = tl
    tris = {"body": body.triangles(), "head": head.triangles(), "tail": tm.triangles()}
    ob = body.object(col)
    S = body_spec(key)
    neck = Vector((0, head_c.y, S["neck"][1] - 0.03))
    oh = head.object(col, origin=neck)
    ob.parent = root
    oh.parent = root
    otl = tm.object(col, origin=tbase)
    otl.name = f"{key}-tail"
    otl.parent = root
    for side, (mm, S0) in arms.items():
        tris[mm.name] = mm.triangles()
        oa = mm.object(col, origin=S0)
        oa.name = f"{key}-arm.{'L' if side > 0 else 'R'}"
        oa.parent = root
    tris["total"] = sum(v for k, v in tris.items())
    root["triangles"] = tris["total"]
    return root, tris


def head_centre(key):
    """World height of the head centre after the chibi scale (for the cameras)."""
    hs = SPECS[key]["head"]
    chin = hs["c"][2] - hs["r"][2] * 0.92
    return chin + (hs["c"][2] - chin) * hs.get("scale", 1.0)


# ------------------------------------------------------------------------------------------------
# Scene, cameras, renders
# ------------------------------------------------------------------------------------------------
SLOTS = {"lan": -1.05, "tu": 0.0, "sau": 1.05}
COUNTER = {"top": 0.55, "depth": 0.42, "width": 3.3, "back": -0.55}  # back edge y, in front of the vendors


def build_scene(scene_name="Vendors"):
    """A NEW scene with the three vendors in a row on a plain light floor, soft key and fill light,
    and a plain wooden counter (shown only in the 'counter' shot)."""
    scene = bpy.data.scenes.get(scene_name) or bpy.data.scenes.new(scene_name)
    for o in list(scene.collection.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    col = bpy.data.collections.get("vendors")
    if col is None:
        col = bpy.data.collections.new("vendors")
    if col.name not in [c.name for c in scene.collection.children]:
        scene.collection.children.link(col)
    report = {}
    for key, fn in (("lan", build_lan), ("tu", build_tu), ("sau", build_sau)):
        root, tris = fn(col)
        root.location = (SLOTS[key], 0, 0)
        report[key] = tris
    # floor
    me = bpy.data.meshes.new("vendors-floor")
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, radius=8, segments=48)
    bm.to_mesh(me)
    bm.free()
    floor = bpy.data.objects.new("vendors-floor", me)
    floor.data.materials.append(pmat(f"c{int(PAL['sand']['dry']):06x}", int(PAL["sand"]["dry"]), 0.95))
    col.objects.link(floor)
    # counter: a plain wooden box, top at COUNTER["top"]
    C = COUNTER
    cm = Mesh("vendors-counter", smooth=False)
    x0, x1 = -C["width"] / 2, C["width"] / 2
    y1, y0 = C["back"], C["back"] - C["depth"]
    rings = [[Vector((x0, y0, z)), Vector((x1, y0, z)), Vector((x1, y1, z)), Vector((x0, y1, z))] for z in (0.0, C["top"])]
    cm.tube(rings, int(PAL["wood"]["mid"]), cap1=Vector((0, (y0 + y1) / 2, C["top"])))
    counter = cm.object(col)
    counter.hide_render = True
    counter.hide_viewport = True
    # world, lights, camera
    world = bpy.data.worlds.get("vendors-world") or bpy.data.worlds.new("vendors-world")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.80, 0.82, 0.84, 1)
    bg.inputs["Strength"].default_value = 1.0
    scene.world = world
    for name, energy, color, rot in (("vendors-key", 3.0, (1.0, 0.95, 0.88), (52, 0, -28)),
                                     ("vendors-fill", 0.9, (0.85, 0.9, 1.0), (65, 0, 140))):
        ld = bpy.data.lights.get(name) or bpy.data.lights.new(name, "SUN")
        ld.energy = energy
        ld.color = color
        ld.angle = math.radians(8)
        lo = bpy.data.objects.new(name, ld)
        lo.rotation_euler = tuple(math.radians(a) for a in rot)
        scene.collection.objects.link(lo)
    cd = bpy.data.cameras.get("vendors-cam") or bpy.data.cameras.new("vendors-cam")
    cam = bpy.data.objects.new("vendors-cam", cd)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = "BLENDER_EEVEE"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    try:
        scene.eevee.taa_render_samples = 32
    except AttributeError:
        pass
    dedupe_materials(scene)
    aim(scene, "lineup")
    return report


def aim(scene, shot, key=None):
    """Point the camera: 'front' / 'three' / 'head' at one vendor, 'lineup' at all three, 'counter'
    at all three behind the counter from a raised camera about 2.5 m away (like the game camera).
    The counter only renders in the 'counter' shot."""
    cam = scene.camera
    x = SLOTS.get(key, 0.0)
    counter = scene.objects.get("vendors-counter")
    if counter is not None:
        counter.hide_render = shot != "counter"
        counter.hide_viewport = shot != "counter"
    if shot == "front":
        cam.data.lens = 100
        eye, target = Vector((x, -5.0, 0.85)), Vector((x, 0, 0.66))
        res = (800, 1000)
    elif shot == "three":
        cam.data.lens = 100
        a = math.radians(38)
        eye, target = Vector((x + 5.0 * math.sin(a), -5.0 * math.cos(a), 1.6)), Vector((x, 0, 0.64))
        res = (800, 1000)
    elif shot == "head":
        cam.data.lens = 100
        hz = head_centre(key)
        eye, target = Vector((x + 1.0, -3.0, hz + 0.45)), Vector((x, 0, hz + 0.02))
        res = (600, 600)
    elif shot == "counter":
        cam.data.lens = 26
        target = Vector((0.0, -0.1, 0.78))
        eye = target + Vector((0.35, -2.05, 1.40))  # about 2.5 m away, looking down ~33 degrees
        res = (1600, 900)
    else:
        cam.data.lens = 60
        eye, target = Vector((0.9, -6.0, 1.7)), Vector((0.0, 0, 0.64))
        res = (1600, 800)
    cam.location = eye
    cam.rotation_euler = (target - eye).to_track_quat("-Z", "Y").to_euler()
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100


def render(path, scene_name="Vendors"):
    scene = bpy.data.scenes[scene_name]
    win = bpy.context.window
    prev = win.scene if win else None
    if win:
        win.scene = scene
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True, scene=scene_name)
    if win and prev is not None:
        win.scene = prev
    return path


def render_sheet(out_dir, scene_name="Vendors"):
    """front, three-quarter and a face close-up per vendor, the line-up, the line-up at phone size
    (figures about 120 px tall) and the three behind the counter from a game-like camera."""
    scene = bpy.data.scenes[scene_name]
    os.makedirs(out_dir, exist_ok=True)
    done = []
    for key in SLOTS:
        for shot in ("front", "three", "head"):
            aim(scene, shot, key)
            done.append(render(os.path.join(out_dir, f"{key}-{shot}.png"), scene_name))
    aim(scene, "lineup")
    done.append(render(os.path.join(out_dir, "lineup.png"), scene_name))
    scene.render.resolution_percentage = 20  # 800 px * 0.20 = 160 px frame, figures about 120 px
    done.append(render(os.path.join(out_dir, "lineup-small.png"), scene_name))
    aim(scene, "counter")
    done.append(render(os.path.join(out_dir, "counter.png"), scene_name))
    aim(scene, "lineup")
    return done


# ------------------------------------------------------------------------------------------------
# Export: one GLB per vendor (cat-<id>.glb) for the game
# ------------------------------------------------------------------------------------------------
GLB_NODES = {"body": "{k}-body", "head": "{k}-head", "arm-left": "{k}-arm.L", "arm-right": "{k}-arm.R", "tail": "{k}-tail"}


def export_glb(out_dir, scene_name="Vendors"):
    """Write public/models/cat-<id>.glb for each vendor: the root `vendor-<id>` with children named
    body, head, arm-left, arm-right, tail (pivots kept). Exported from renamed copies in a temporary
    scene, so the Vendors scene is untouched. Front is Blender -Y, which the Y-up exporter writes as
    glTF +Z (Babylon's -Z, out to sea, like the people models). Returns [(id, triangles)]."""
    src = bpy.data.scenes[scene_name]
    win = bpy.context.window
    prev = win.scene if win else None
    tmp = bpy.data.scenes.new("vendors-export")
    if win:
        win.scene = tmp
    done = []
    try:
        for key in SLOTS:
            root = src.objects[f"vendor-{key}"]
            root_name = root.name
            root.name = f"{root_name}-src"  # the copy takes the exact name (object names are global)
            r2 = bpy.data.objects.new(root_name, None)
            tmp.collection.objects.link(r2)
            tris = 0
            for new, old in GLB_NODES.items():
                o = src.objects[old.format(k=key)]
                c = o.copy()
                c.data = o.data.copy()  # keeps materials and per-face smooth flags
                c.name = new
                tmp.collection.objects.link(c)
                c.parent = r2
                c.matrix_parent_inverse = Matrix.Identity(4)
                lib.bake_colors(c)
                tris += lib.triangles(c)
            bpy.context.view_layer.update()
            for x in bpy.data.objects:
                x.select_set(False)
            for o in [r2] + list(r2.children):
                o.select_set(True)
            os.makedirs(out_dir, exist_ok=True)
            bpy.ops.export_scene.gltf(
                filepath=os.path.join(out_dir, f"cat-{key}.glb"), export_format="GLB", use_selection=True,
                use_active_scene=True, export_vertex_color="ACTIVE", export_materials="EXPORT",
                export_cameras=False, export_lights=False, export_apply=True, export_yup=True)
            done.append((key, tris))
            for o in list(r2.children) + [r2]:
                me = o.data if o.type == "MESH" else None
                bpy.data.objects.remove(o, do_unlink=True)
                if me is not None:
                    bpy.data.meshes.remove(me)
            root.name = root_name
    finally:
        if win and prev is not None:
            win.scene = prev
        bpy.data.scenes.remove(tmp)
    return done
