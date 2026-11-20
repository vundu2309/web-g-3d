"""The four baits of the market's bait row, as small stylised low-poly models for their card pictures.

1 GIUN (earthworm, the free default), 2 TOM (small shrimp), 3 CA CON (a small silvery baitfish),
4 MUC (a fresh squid). They are shown about 110 px wide, so each is chunky and reads by its
silhouette and colour: a curled ringed worm with a pale saddle, a C-curled orange shrimp with a tail
fan and short thick feelers, a blue-backed silver fish with a forked tail, a speckled squid tilted to
show its fins, with short arms.

Conventions (as public/models/fish-*.glb, see src/ocean/glb-parts.ts): the nose points to +X, up is
+Z in Blender (+Y in the glTF file), the longest side is 1 and the model is centred on its origin.
Each bait is ONE mesh with one material per palette colour (lib.bake_colors writes the sRGB colours
to vertex colours). Every surface is closed (fins and tail plates have a thickness), so nothing needs
a transparent or two-sided material.

The card picture will be drawn by src/ocean/creature-thumb.ts (painter's algorithm, yaw -0.45,
pitch 0.28 by default). `thumb_png` repeats that projection here in pure Python so the silhouette
test is the game's own view, not a nicer Blender camera.

Like props.py this never calls `lib.reset()`: it builds in a NEW scene of the running Blender.

    import sys; sys.path.insert(0, "/path/to/tools/blender")
    import importlib, props, baits; importlib.reload(props); importlib.reload(baits)
    baits.build_scene("Baits"); baits.previews("/scratch/dir")
"""
import math, os, random, struct, zlib
import bpy, bmesh
from mathutils import Matrix, Vector
import lib, props

PAL = lib.PAL
FACE = PAL["people"]["face"]
CLOTHES = PAL["people"]["clothes"]
PAINT = PAL["paint"]

# Every colour is a palette colour (palette.json / src/ocean/art/colors.ts PAL), by role.
WORM = {
    "body": FACE["lip"],  # 0xc0716b, the pink-brown body
    "ring": FACE["lipDeep"],  # 0x8c4c44, the grooves between rings
    "saddle": PAL["seabed"]["coral"][1],  # 0xf2a0b8, the pale swollen band (clitellum)
    "head": PAL["seabed"]["coral"][4],  # 0xe8604f, the redder front end
}
SHRIMP = {
    "shell": PAINT["coral"],  # 0xef866a
    "band": PAL["rod"]["lure"],  # 0xff7333, the back of each segment
    "belly": PAL["plants"]["shells"][2],  # 0xf2b27a
    "fan": PAL["seabed"]["coral"][4],  # 0xe8604f, tail fan and feelers
    "eye": PAL["people"]["hair"]["black"],  # 0x1d1917
}
FISH = {
    "back": CLOTHES["jeans"],  # 0x4b6c9c, blue-grey back
    "side": PAL["market"]["silver"],  # 0xc4d3e0
    "belly": PAINT["white"],  # 0xf6f8fa
    "stripe": PAL["metal"]["light"],  # 0xcfd5df
    "fin": CLOTHES["jeansDark"],  # 0x3d5884
    "eye": PAL["people"]["hair"]["black"],
    "iris": PAL["market"]["coin"],  # 0xffd35a, the gold ring round the pupil
}
SQUID = {
    "mantle": PAINT["cream"],  # 0xfff7e6
    "warm": PAINT["creamWarm"],  # 0xfff1c9, arms and belly
    "back": PAL["seabed"]["coral"][1],  # 0xf2a0b8, the pink back
    "arm": PAL["plants"]["shells"][1],  # 0xf6c9c0, the arm tips
    "spot": CLOTHES["apronRose"],  # 0xd4567a, the chromatophore speckles
    "spot2": CLOTHES["babaMaroon"],  # 0x8e3b48, darker speckles
    "eye": PAL["people"]["hair"]["black"],
    "eyering": FACE["white"],  # 0xf4f4ea
}

# Background of the item cards, for the previews.
CARD = 0xF6FBFF


class Mesh(props.Mesh):
    """props.Mesh with a per-face shading flag (smooth organic parts, flat shell plates)."""

    def quad(self, verts, hexint, smooth=True):
        f = super().quad(verts, hexint)
        if f is not None:
            f.smooth = smooth
        return f

    def finish(self, collection, longest=1.0, roll=0.0):
        """Triangulate, roll about X, centre the bounding box on the origin, scale the longest side
        to `longest`, then make the object (per-face shading kept)."""
        bm = self.bm
        bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method="BEAUTY", ngon_method="EAR_CLIP")
        if roll:
            bmesh.ops.rotate(bm, verts=bm.verts[:], cent=(0, 0, 0), matrix=Matrix.Rotation(roll, 3, "X"))
        lo = Vector([min(v.co[k] for v in bm.verts) for k in range(3)])
        hi = Vector([max(v.co[k] for v in bm.verts) for k in range(3)])
        s = longest / max(hi - lo)
        c = (lo + hi) / 2
        for v in bm.verts:
            v.co = (v.co - c) * s
        me = bpy.data.meshes.new(self.name)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        bm.to_mesh(me)
        bm.free()
        for n, h in self.mats:
            me.materials.append(lib.mat(n, h, 0.7))
        o = bpy.data.objects.new(self.name, me)
        collection.objects.link(o)
        return o


# ------------------------------------------------------------------------------------------------
# Building blocks
# ------------------------------------------------------------------------------------------------
def tube(m, pts, radii, sides, color, smooth=True, up=Vector((0, 1, 0)), twist=0.0):
    """A closed tube along `pts`. `radii[i]` is (across, along-up) of the elliptical section; a zero
    radius at an end closes the tube to a point. `color(i, k, a)` gives the hex of the quad after
    ring i at side k (a is the side's angle, 0 = toward `up`). Returns the rings of vertices."""
    n = len(pts)
    rings = []
    u = None
    for i, p in enumerate(pts):
        tan = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        if u is None:
            u = (up - tan * up.dot(tan)).normalized()
        else:  # parallel transport, so the section does not twist
            u = (u - tan * u.dot(tan)).normalized()
        v = tan.cross(u).normalized()
        ra, rb = radii[i]
        if ra < 1e-5 and rb < 1e-5:
            rings.append([m.vert(p)])
            continue
        ring = []
        for k in range(sides):
            a = math.tau * k / sides + twist
            # u carries the 'up' half-axis rb, v the 'across' half-axis ra
            ring.append(m.vert(p + u * (math.cos(a) * rb) + v * (math.sin(a) * ra)))
        rings.append(ring)
    for i in range(n - 1):
        r0, r1 = rings[i], rings[i + 1]
        for k in range(sides):
            a = math.tau * (k + 0.5) / sides
            col = color(i, k, a)
            if len(r0) == 1:
                m.quad([r0[0], r1[(k + 1) % sides], r1[k]], col, smooth)
            elif len(r1) == 1:
                m.quad([r0[k], r0[(k + 1) % sides], r1[0]], col, smooth)
            else:
                m.quad([r0[k], r0[(k + 1) % sides], r1[(k + 1) % sides], r1[k]], col, smooth)
    for end in (0, n - 1):  # flat cap where the end is open
        if len(rings[end]) > 1:
            m.quad(list(reversed(rings[end])) if end == 0 else rings[end], color(min(end, n - 2), 0, 0.0), smooth)
    return rings


def ball(m, centre, radii, hexint, segs=8, rings=5, smooth=True, color=None):
    """An ellipsoid (radii along x, y, z). `color(normal)` may colour faces by direction."""
    r = bmesh.ops.create_uvsphere(m.bm, u_segments=segs, v_segments=rings, radius=1.0)
    for v in r["verts"]:
        v.co = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2])) + Vector(centre)
    faces = {f for v in r["verts"] for f in v.link_faces}
    for f in faces:
        f.material_index = m.slot(color(f.normal.copy()) if color else hexint)
        f.smooth = smooth
    return r["verts"]


def plate(m, outline, origin, ax, ay, thick, hexint, smooth=False, edge=None):
    """A flat plate (a fin, a tail) of `thick` thickness from a 2D outline in the plane (ax, ay)."""
    o, ax, ay = Vector(origin), Vector(ax), Vector(ay)
    nrm = ax.cross(ay).normalized() * (thick / 2)
    top = [m.vert(o + ax * x + ay * y + nrm) for x, y in outline]
    bot = [m.vert(o + ax * x + ay * y - nrm) for x, y in outline]
    m.quad(top, hexint, smooth)
    m.quad(list(reversed(bot)), hexint, smooth)
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        m.quad([top[i], bot[i], bot[j], top[j]], edge or hexint, smooth)


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------------------------------------
# 1 GIUN: earthworm, curled in one and a bit loose loops
# ------------------------------------------------------------------------------------------------
def worm(collection, seed=1, wiggle=0.16, curl=0.95, thick=0.07, segs=36, sides=8, name="bait-worm"):
    """A worm lying in a loose S with its front end rolled into a curl (the curl faces the viewer)."""
    m = Mesh(name)
    pts, radii = [], []
    split = 0.55  # the first part is the S, the rest is the curl
    p = Vector((-0.5, 0.0, -0.05))
    heading = 0.35
    step = 1.75 / segs
    for i in range(segs + 1):
        t = i / segs  # 0 = tail, 1 = head
        pts.append(p.copy())
        if t < split:
            heading = wiggle * 5.0 * math.sin(t / split * math.tau * 0.85 + 0.4)
        else:
            u = (t - split) / (1 - split)
            heading += curl * math.tau / ((1 - split) * segs) * (0.6 + 0.8 * u)
        d = Vector((math.cos(heading), 0.0, math.sin(heading)))
        # the curl climbs a little toward the viewer so the head lies over the body, not in it
        p = p + d * step * (1.0 - 0.45 * max(0.0, t - split)) + Vector((0, 0.012 if t >= split else 0.0, 0))
        w = thick * (0.6 + 0.4 * smoothstep(0.0, 0.3, t))  # thinner tail
        w *= 1.0 + 0.16 * math.exp(-((t - 0.5) / 0.04) ** 2)  # swollen saddle
        radii.append((w, w))
    radii[0] = (0.0, 0.0)
    radii[-1] = (0.0, 0.0)
    radii[-2] = (radii[-2][0] * 0.8, radii[-2][1] * 0.8)
    pts[-1] = pts[-2] + (pts[-2] - pts[-3]).normalized() * thick * 0.7
    pts[0] = pts[1] + (pts[1] - pts[2]).normalized() * thick * 0.5

    def col(i, k, a):
        t = (i + 0.5) / segs
        if 0.45 < t < 0.55:
            return WORM["saddle"]
        if t > 0.9:
            return WORM["head"]
        return WORM["ring"] if i % 3 == 0 else WORM["body"]

    tube(m, pts, radii, sides, col, smooth=True, up=Vector((0, 1, 0)))
    return m.finish(collection)


# ------------------------------------------------------------------------------------------------
# 2 TOM: small shrimp, curled into a C with the tail fan under the head
# ------------------------------------------------------------------------------------------------
def shrimp(collection, seed=2, curl=230.0, segs=16, sides=8, name="bait-shrimp"):
    m = Mesh(name)
    R = 0.3
    a0, a1 = math.radians(15), math.radians(15 + curl)
    pts, radii = [], []
    for i in range(segs + 1):
        t = i / segs  # 0 = head (front, +X top), 1 = tail
        a = lerp(a0, a1, t)
        rr = R * (1 - 0.18 * t)
        pts.append(Vector((rr * math.cos(a), 0.0, rr * math.sin(a))))
        h = lerp(0.15, 0.05, t ** 0.9)  # height in the curl plane
        w = h * 0.78  # a little flattened side to side
        if t < 0.3:  # the carapace is one smooth lump
            h *= 1.0 + 0.1 * math.sin(t / 0.3 * math.pi)
        else:  # overlapping segment plates
            seg_t = ((t - 0.3) / 0.7 * 6) % 1.0
            h *= 1.0 + 0.1 * (1 - seg_t)
            w *= 1.0 + 0.08 * (1 - seg_t)
        radii.append((w, h))
    # the head end closes in a short snout
    head_dir = (pts[0] - pts[1]).normalized()
    pts.insert(0, pts[0] + head_dir * 0.1)
    radii.insert(0, (0.0, 0.0))
    nseg = len(pts) - 1

    def col(i, k, a):
        t = (i - 0.5) / segs
        outer = math.cos(a)  # +1 toward the back (outside of the curl), -1 belly
        if outer < -0.45:
            return SHRIMP["belly"]
        if t > 0.3 and int((t - 0.3) / 0.7 * 6 * 2) % 2 == 0 and outer > 0.2:
            return SHRIMP["band"]
        return SHRIMP["shell"]

    # 'up' along the radial direction (outside of the curl) is the shrimp's back
    tube(m, pts, radii, sides, col, smooth=False, up=Vector((math.cos(a0), 0, math.sin(a0))))
    # tail fan: a telson and two uropods, spread in the curl plane, pointing along the tail
    end, prev = pts[-1], pts[-2]
    d = (end - prev).normalized()
    side = Vector((0, 1, 0)).cross(d).normalized()  # in the curl plane, square to the tail
    for ang, ln, wd in ((0.0, 0.2, 0.06), (0.55, 0.18, 0.055), (-0.55, 0.18, 0.055)):
        ax = (d * math.cos(ang) + side * math.sin(ang)).normalized()
        ay = Vector((0, 1, 0)).cross(ax).normalized()
        outline = [(0.0, -0.02), (ln * 0.55, -wd), (ln, -wd * 0.55), (ln * 1.02, 0.0), (ln, wd * 0.55), (ln * 0.55, wd), (0.0, 0.02)]
        plate(m, outline, end - d * 0.01, ax, ay, 0.022, SHRIMP["fan"] if ang == 0 else SHRIMP["band"])
    # big eyes at the front sides (stalks dropped: they do not read at card size)
    head = pts[2]
    back = Vector((math.cos(a0), 0, math.sin(a0)))
    for sy in (1, -1):
        c = head + back * 0.07 + Vector((0.03, sy * 0.1, 0))
        ball(m, c + Vector((0.01, sy * 0.012, 0.005)), (0.05, 0.05, 0.05), SHRIMP["eye"], segs=8, rings=5)
    # a short rostrum spike over the snout
    snout = pts[0]
    tube(m, [head + back * 0.1, snout + back * 0.08 + Vector((0.04, 0, 0)), snout + back * 0.1 + Vector((0.12, 0, 0))],
         [(0.02, 0.03), (0.014, 0.02), (0.0, 0.0)], 4, lambda i, k, a: SHRIMP["band"], smooth=False, up=Vector((0, 0, 1)))
    # two short, thick feelers sweeping back over the body
    for sy in (1, -1):
        s0 = snout + Vector((0.0, sy * 0.04, 0.03))
        ctrl = [s0, s0 + Vector((0.12, sy * 0.02, 0.12)), s0 + Vector((0.08, sy * 0.05, 0.3)), s0 + Vector((-0.06, sy * 0.06, 0.4))]
        rad = [(0.022, 0.022), (0.02, 0.02), (0.016, 0.016), (0.0, 0.0)]
        tube(m, ctrl, rad, 4, lambda i, k, a: SHRIMP["fan"], smooth=True, up=Vector((0, 1, 0)))
    # three pairs of stubby legs hanging under the head (none inside the curl: there they read as teeth)
    for j in range(3):
        t = 0.05 + j * 0.07
        a = lerp(a0, a1, t)
        rr = R * (1 - 0.18 * t)
        base = Vector((rr * math.cos(a), 0.0, rr * math.sin(a)))
        inward = -Vector((math.cos(a), 0, math.sin(a)))
        h = lerp(0.15, 0.05, t ** 0.9)
        for sy in (1, -1):
            p0 = base + inward * h * 0.75 + Vector((0, sy * 0.04, 0))
            p1 = p0 + Vector((0.03 - 0.02 * j, sy * 0.025, -0.11))
            tube(m, [p0, p1], [(0.022, 0.022), (0.012, 0.012)], 4, lambda i, k, a: SHRIMP["band"], smooth=False,
                 up=Vector((0, 1, 0)))
    return m.finish(collection)


def lerp(a, b, t):
    return a + (b - a) * t


# ------------------------------------------------------------------------------------------------
# 3 CA CON: a small silvery baitfish with a forked tail
# ------------------------------------------------------------------------------------------------
def baitfish(collection, seed=3, depth=0.135, bend=0.05, segs=12, sides=10, name="bait-fish"):
    m = Mesh(name)
    nose, tail = 0.45, -0.2
    pts, radii = [], []
    for i in range(segs + 1):
        t = i / segs  # 0 = nose, 1 = tail root
        x = lerp(nose, tail, t)
        # height profile: blunt nose, deepest a third along, thin tail root
        h = depth * math.sin(min(1.0, t / 0.35) * math.pi / 2) ** 0.6 * (1 - 0.78 * smoothstep(0.35, 1.0, t))
        if i == 0:
            h = 0.0
        y = bend * math.sin(t * math.pi * 0.9 - 0.3)  # a little swimming curve
        pts.append(Vector((x, y, -0.012 * t)))
        radii.append((h * 0.5, h))
    tilt = Vector((0, 0, 1))

    def col(i, k, a):
        up = math.cos(a)
        t = (i + 0.5) / segs
        if up > 0.55:
            return FISH["back"]
        if up < -0.5:
            return FISH["belly"]
        if abs(up - 0.25) < 0.2 and t > 0.25:
            return FISH["stripe"]
        if t < 0.25 and abs(up) < 0.55 and i in (2,):
            return FISH["stripe"]  # the gill edge
        return FISH["side"]

    rings = tube(m, pts, radii, sides, col, smooth=True, up=tilt)
    end = pts[-1]
    # forked tail, a thick plate in the side plane (XZ)
    outline = [(0.0, 0.03), (-0.2, 0.17), (-0.25, 0.15), (-0.15, 0.0), (-0.25, -0.15), (-0.2, -0.17), (0.0, -0.03)]
    plate(m, outline, end + Vector((0.025, 0, 0)), (1, 0, 0), (0, 0, 1), 0.02, FISH["fin"])
    # dorsal fin and the anal fin
    top = pts[5]
    plate(m, [(0.06, 0.0), (-0.02, 0.1), (-0.08, 0.09), (-0.1, 0.0)], top + Vector((0, 0, depth * 0.85)), (1, 0, 0), (0, 0, 1), 0.018, FISH["fin"])
    bot = pts[8]
    plate(m, [(0.04, 0.0), (-0.06, 0.0), (-0.07, -0.055), (-0.02, -0.06)], bot + Vector((0, 0, -radii[8][1] * 0.85)), (1, 0, 0), (0, 0, 1), 0.016, FISH["fin"])
    # pectoral fins, angled back on both sides
    pec = pts[3]
    for sy in (1, -1):
        plate(m, [(0.0, 0.0), (-0.1, 0.03), (-0.11, -0.02)], pec + Vector((0, sy * radii[3][0] * 0.95, -radii[3][1] * 0.35)),
              (1, 0, 0), (0, sy * 0.4, -0.9), 0.014, FISH["fin"])
    # big eyes: a gold ring with a black pupil on each side
    eye = pts[2]
    hr = radii[2]
    for sy in (1, -1):
        c = eye + Vector((0.0, sy * hr[0] * 0.78, hr[1] * 0.22))
        ball(m, c, (0.056, 0.026, 0.056), FISH["iris"], segs=10, rings=5)
        ball(m, c + Vector((0.004, sy * 0.013, 0.0)), (0.037, 0.022, 0.037), FISH["eye"], segs=8, rings=4)
    return m.finish(collection)


# ------------------------------------------------------------------------------------------------
# 4 MUC: a fresh squid, tilted to show its back and fins, with short arms
# ------------------------------------------------------------------------------------------------
def squid(collection, seed=4, arms=6, roll=-1.4, segs=8, sides=8, name="bait-squid"):
    """Mantle tip with fins toward +X, head and big eyes in the middle, short thick arms toward -X.
    Rolled about X (`roll`, radians) so its speckled back, both fins and one eye face the thumb's
    viewer: -1.875 turns the back straight at the default creature-thumb eye (see THUMB_VIEW), -1.4
    keeps an eye in view; a thumb seen from above would want about -0.7."""
    rng = random.Random(seed)
    m = Mesh(name)
    tip, collar = 0.55, 0.0
    pts, radii = [], []
    for i in range(segs + 1):
        t = i / segs  # 0 = mantle tip, 1 = collar
        x = lerp(tip, collar, t)
        r = 0.13 * math.sin(min(1.0, t / 0.6) * math.pi / 2) ** 0.8 * (1.0 + 0.05 * t)
        if i == 0:
            r = 0.0
        pts.append(Vector((x, 0, 0)))
        radii.append((r, r * 0.9))
    spots = {}

    def col(i, k, a):
        up = math.cos(a)
        if up > 0.1:  # the back: pink, with darker speckles here and there
            key = (i, k)
            if key not in spots:
                v = rng.random()
                spots[key] = SQUID["spot"] if v < 0.22 else SQUID["spot2"] if v < 0.3 else SQUID["back"]
            return spots[key]
        if up > -0.45:
            return SQUID["back"] if i % 2 else SQUID["mantle"]
        return SQUID["mantle"]

    tube(m, pts, radii, sides, col, smooth=True, up=Vector((0, 0, 1)))
    # the two fins at the mantle tip, a wide arrow-head shape, flat in the body's side-to-side plane
    for sy in (1, -1):
        outline = [(0.03, 0.0), (0.15, 0.0), (0.0, 0.2), (-0.12, 0.14), (-0.17, 0.0)]
        plate(m, [(x, y * sy) for x, y in outline], (0.38, sy * 0.05, 0.01), (1, 0, 0), (0, 1, 0), 0.016,
              SQUID["back"], smooth=False)
    # the head with two big eyes
    hx = -0.06
    ball(m, (hx, 0, 0), (0.08, 0.1, 0.09), SQUID["warm"], segs=8, rings=4)
    for sy in (1, -1):
        c = Vector((hx + 0.005, sy * 0.088, 0.02))
        ball(m, c, (0.05, 0.03, 0.05), SQUID["eyering"], segs=6, rings=3)
        ball(m, c + Vector((0.0, sy * 0.018, 0.0)), (0.035, 0.022, 0.035), SQUID["eye"], segs=6, rings=3)
    # short thick arms splayed in a fan behind the head, curling at the ends, and two longer tentacles
    base_x = -0.11
    for j in range(arms + 2):
        long = j >= arms
        if long:
            ang = -0.3 if j == arms else 0.3
        else:
            ang = (j / (arms - 1) - 0.5) * 2.2
        ln = 0.4 if long else rng.uniform(0.24, 0.3)
        spread = Vector((0, math.sin(ang), math.cos(ang) * 0.6))
        pts_a, rad_a = [], []
        n = 4
        for i in range(n + 1):
            t = i / n
            p = Vector((base_x - ln * t, 0, 0)) + spread * (0.04 + 0.2 * t * (0.5 if long else 1.0))
            p += spread * (0.06 * t * t)  # the tips curl outward
            pts_a.append(p)
            r = lerp(0.04, 0.016, t)
            if long and t > 0.6:
                r = 0.026  # the club
            rad_a.append((r, r) if i < n else (0.011, 0.011))  # blunt, rounded-looking tips
        tube(m, pts_a, rad_a, 4, lambda i, k, a: SQUID["spot"] if i >= 3 else SQUID["back"], smooth=True,
             up=Vector((0, 0, 1)), twist=math.pi / 4)
    return m.finish(collection, roll=roll)


# ------------------------------------------------------------------------------------------------
# Scene, previews and the game-view thumbnail
# ------------------------------------------------------------------------------------------------
BAITS = ("bait-worm", "bait-shrimp", "bait-fish", "bait-squid")


def _lin(h):
    return tuple(((c / 255) ** 2.2) for c in ((h >> 16) & 255, (h >> 8) & 255, h & 255))


def build_scene(scene_name="Baits"):
    """A NEW scene with the four baits side by side, a soft light and an orthographic camera."""
    scene = bpy.data.scenes.get(scene_name) or bpy.data.scenes.new(scene_name)
    for o in list(scene.collection.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    col = bpy.data.collections.get("baits") or bpy.data.collections.new("baits")
    if col.name not in [c.name for c in scene.collection.children]:
        scene.collection.children.link(col)
    made = {}
    for i, fn in enumerate((worm, shrimp, baitfish, squid)):
        o = fn(col)
        o.location = (i * 1.4, 0, 0)
        made[o.name] = o
    # world: the card colour seen by the camera, a soft sky light on the models
    world = bpy.data.worlds.get("baits-world") or bpy.data.worlds.new("baits-world")
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    path = nt.nodes.new("ShaderNodeLightPath")
    card = nt.nodes.new("ShaderNodeBackground")
    card.inputs["Color"].default_value = (*_lin(CARD), 1)
    card.inputs["Strength"].default_value = 1.0
    sky = nt.nodes.new("ShaderNodeBackground")
    sky.inputs["Color"].default_value = (0.75, 0.82, 0.95, 1)
    sky.inputs["Strength"].default_value = 0.55
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(path.outputs["Is Camera Ray"], mix.inputs[0])
    nt.links.new(sky.outputs[0], mix.inputs[1])
    nt.links.new(card.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])
    scene.world = world
    sun_data = bpy.data.lights.get("baits-sun") or bpy.data.lights.new("baits-sun", "SUN")
    sun_data.energy = 2.6
    sun_data.color = (1.0, 0.96, 0.9)
    sun = bpy.data.objects.new("baits-sun", sun_data)
    sun.rotation_euler = (math.radians(40), math.radians(10), math.radians(150))
    scene.collection.objects.link(sun)
    cam_data = bpy.data.cameras.get("baits-cam") or bpy.data.cameras.new("baits-cam")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("baits-cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = "BLENDER_EEVEE"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.film_transparent = False
    return made


def thumb_view(yaw=-0.45, pitch=0.28):
    """Where creature-thumb's eye sits, as a Blender direction from the model (yaw, pitch as there)."""
    sy, cy, sp, cp = math.sin(yaw), math.cos(yaw), math.sin(pitch), math.cos(pitch)
    return Vector((sy * cp, cy * cp, -sp)).normalized()


# The default creature-thumb eye is on the +Y side, a little behind the nose and a little BELOW
# (pitch 0.28 tilts the top away from the viewer): about (-0.42, 0.87, -0.28).
THUMB_VIEW = thumb_view()
VIEW_ABOVE = Vector((-0.35, 1.0, 0.8)).normalized()  # a three-quarter view from above, for comparison


def _aim(scene, target, extent, view=VIEW_ABOVE):
    cam = scene.camera
    cam.location = Vector(target) + view * 6.0
    cam.rotation_euler = (-view).to_track_quat("-Z", "Y").to_euler()
    cam.data.ortho_scale = extent


def _mirror(path):
    """creature-thumb draws its turned x to the right with y up while looking along +Z, which is a
    mirror image of what a real camera at the same eye sees; flip the render so it matches the game."""
    import numpy as np
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    img.pixels.foreach_set(px.reshape(h, w, 4)[:, ::-1, :].ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def render_one(scene, name, path, res=1024, view=THUMB_VIEW):
    for o in scene.objects:
        if o.type == "MESH":
            o.hide_render = o.name != name
    o = scene.objects[name]
    scene.render.resolution_x = scene.render.resolution_y = res
    _aim(scene, o.location, 1.3, view)
    bpy.context.window.scene = scene
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True, scene=scene.name)
    if view is THUMB_VIEW:
        _mirror(path)
    return path


def render_row(scene, path, cell=110, view=THUMB_VIEW):
    """All four side by side, each about `cell` px wide."""
    for o in scene.objects:
        if o.type == "MESH":
            o.hide_render = False
    # lay them out along the camera's own right so they sit side by side in the picture
    right = (-view).cross(Vector((0, 0, 1))).normalized()
    if view is THUMB_VIEW:  # the picture is mirrored afterwards, so lay them out the other way
        right = -right
    keep = {n: scene.objects[n].location.copy() for n in BAITS}
    for i, n in enumerate(BAITS):
        scene.objects[n].location = right * (i * 1.25)
    centre = right * 1.875
    span = 3 * 1.25 + 1.2
    scene.render.resolution_x = cell * 4
    scene.render.resolution_y = round(cell * 0.8)
    # ortho_scale is the larger side; side by side cells 1.4 m apart, the camera is turned, so measure along its x
    _aim(scene, centre, span, view)
    bpy.context.window.scene = scene
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True, scene=scene.name)
    for n, loc in keep.items():
        scene.objects[n].location = loc
    if view is THUMB_VIEW:
        _mirror(path)
    return path


# --- creature-thumb projection, rasterised in plain Python ---------------------------------------
_TL = Vector((-0.4, 0.75, -0.55)).normalized()


def project(o, yaw=-0.45, pitch=0.28):
    """The triangles of `o` as src/ocean/creature-thumb.ts draws them: (points, depth, light, colour)."""
    me = o.data
    me.calc_loop_triangles()
    cy, sy, cp, sp = math.cos(yaw), math.sin(yaw), math.cos(pitch), math.sin(pitch)
    turned = []
    mw = o.matrix_world.to_3x3()  # turn only: the fit removes any offset
    for v in me.vertices:
        w = mw @ v.co
        x, y, z = w.x, w.z, -w.y  # Blender -> glTF (Y up)
        x1 = x * cy + z * sy
        z1 = -x * sy + z * cy
        turned.append((x1, y * cp - z1 * sp, y * sp + z1 * cp))
    out = []
    for lt in me.loop_triangles:
        a, b, c = (turned[i] for i in lt.vertices)
        ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
        vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
        nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
        ln = math.sqrt(nx * nx + ny * ny + nz * nz) or 1
        nx, ny, nz = nx / ln, ny / ln, nz / ln
        if nz > 0:
            nx, ny, nz = -nx, -ny, -nz
        light = 0.52 + 0.48 * max(0.0, nx * _TL.x + ny * _TL.y + nz * _TL.z)
        mat = o.material_slots[lt.material_index].material if o.material_slots else None
        if mat is not None and "hex" in mat:
            h = int(mat["hex"])
            col = (((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255)
        else:  # an imported model: its baked corner colours (sRGB bytes stored as they are)
            ca = me.color_attributes.active_color
            col = tuple(sum(ca.data[li].color[k] for li in lt.loops) / 3 for k in range(3))
        out.append(((a[0], -a[1], b[0], -b[1], c[0], -c[1]), (a[2] + b[2] + c[2]) / 3, light, col))
    out.sort(key=lambda t: -t[1])
    return out


def raster(tris, width, height, bg=CARD, ss=4):
    """Paint the sorted triangles into width x height pixels (box filtered from ss x ss samples),
    fitted as fish-thumb.ts fits them (92 % of the canvas, centred). Returns rows of (r, g, b)."""
    W, H = width * ss, height * ss
    xs = [p for t in tris for p in t[0][0::2]]
    ys = [p for t in tris for p in t[0][1::2]]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    fit = min(W * 0.92 / (maxx - minx or 1), H * 0.92 / (maxy - miny or 1))
    ox = (W - (maxx - minx) * fit) / 2 - minx * fit
    oy = (H - (maxy - miny) * fit) / 2 - miny * fit
    bgc = ((bg >> 16) & 255, (bg >> 8) & 255, bg & 255)
    buf = [list(bgc) for _ in range(W * H)]
    for pts, _, light, col in tris:
        x0, y0, x1, y1, x2, y2 = (pts[k] * fit + (ox if k % 2 == 0 else oy) for k in range(6))
        paint = [min(255, round(c * 255 * light)) for c in col]
        d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(d) < 1e-9:
            continue
        lo_x, hi_x = max(0, int(min(x0, x1, x2))), min(W - 1, int(max(x0, x1, x2)) + 1)
        lo_y, hi_y = max(0, int(min(y0, y1, y2))), min(H - 1, int(max(y0, y1, y2)) + 1)
        e = 0.35 / abs(d) * 0 - 1e-6 * 0  # stroke widening is ignored (0.8 px of 2x canvas)
        for py in range(lo_y, hi_y + 1):
            cyp = py + 0.5
            for px in range(lo_x, hi_x + 1):
                cxp = px + 0.5
                l1 = ((y1 - y2) * (cxp - x2) + (x2 - x1) * (cyp - y2)) / d
                l2 = ((y2 - y0) * (cxp - x2) + (x0 - x2) * (cyp - y2)) / d
                l3 = 1 - l1 - l2
                if l1 >= -0.02 and l2 >= -0.02 and l3 >= -0.02:
                    buf[py * W + px] = paint
    rows = []
    n = ss * ss
    for y in range(height):
        row = []
        for x in range(width):
            r = g = b = 0
            for sy_ in range(ss):
                base = (y * ss + sy_) * W + x * ss
                for sx_ in range(ss):
                    p = buf[base + sx_]
                    r += p[0]
                    g += p[1]
                    b += p[2]
            row.append((r // n, g // n, b // n))
        rows.append(row)
    return rows


def write_png(path, rows):
    h, w = len(rows), len(rows[0])
    raw = b"".join(b"\x00" + bytes(c for px in row for c in px) for row in rows)
    chunk = lambda tag, data: struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    return path


def thumb_row(scene, path, cell=110, gap=8, yaw=-0.45, pitch=0.28, ss=4):
    """The four baits drawn by the game's thumb projection, each `cell` x 0.7 cell, side by side."""
    h = round(cell * 0.7)
    cells = [raster(project(scene.objects[n], yaw, pitch), cell, h, ss=ss) for n in BAITS]
    bg = ((CARD >> 16) & 255, (CARD >> 8) & 255, CARD & 255)
    rows = []
    for y in range(h):
        row = [bg] * gap
        for c in cells:
            row += c[y] + [bg] * gap
        rows.append(row)
    pad = [[bg] * len(rows[0]) for _ in range(gap)]
    return write_png(path, pad + rows + pad)


def previews(out_dir, scene_name="Baits"):
    scene = bpy.data.scenes[scene_name]
    os.makedirs(out_dir, exist_ok=True)
    done = {}
    for n in BAITS:
        done[n] = render_one(scene, n, os.path.join(out_dir, f"{n}-1024.png"))
        done[n + "-above"] = render_one(scene, n, os.path.join(out_dir, f"{n}-above-512.png"), res=512, view=VIEW_ABOVE)
    done["row"] = render_row(scene, os.path.join(out_dir, "baits-row-110.png"))
    done["thumb110"] = thumb_row(scene, os.path.join(out_dir, "baits-thumb-110.png"))
    done["thumb220"] = thumb_row(scene, os.path.join(out_dir, "baits-thumb-220.png"), cell=220, gap=16, ss=2)
    done["tris"] = {n: lib.triangles(scene.objects[n]) for n in BAITS}
    return done


# The file of a bait, public/models/bait-<id>.glb, in the same layout as the fish files
# (src/ocean/glb-parts.ts parseFishGlb): a root with `body` (the mesh, vertex colours) and `hook`
# (an empty at the nose, where the hook goes).
FILES = {
    "bait-worm": "bait-giun.glb",
    "bait-shrimp": "bait-tom.glb",
    "bait-fish": "bait-ca-con.glb",
    "bait-squid": "bait-muc.glb",
}


def export_bait(out_dir, name, scene_name="Baits"):
    """Write one bait: a copy at the origin named `body`, a `hook` empty at its nose (+X end)."""
    scene = bpy.data.scenes[scene_name]
    bpy.context.window.scene = scene  # the exporter selects through the active view layer
    src = scene.objects[name]
    # Object names are unique in a file and the exporter writes them as the node names: step any
    # other `bait`/`body`/`hook` aside (other scenes of the session have them) and put it back.
    parked = []
    for other in bpy.data.objects:
        if other.name in ("bait", "body", "hook"):
            parked.append((other, other.name))
            other.name = other.name + "-parked"
    root = bpy.data.objects.new("bait", None)
    scene.collection.objects.link(root)
    body = src.copy()
    body.data = src.data.copy()
    body.name = "body"
    scene.collection.objects.link(body)
    # the colours the game paints: the sRGB hex of each face's material, one per corner (COLOR_0)
    for key in [k for k in body.data.color_attributes.keys()]:
        body.data.color_attributes.remove(body.data.color_attributes[key])
    lib.bake_colors(body)
    body.location = (0, 0, 0)
    body.parent = root
    xs = [v.co.x for v in body.data.vertices]
    hook = bpy.data.objects.new("hook", None)
    scene.collection.objects.link(hook)
    hook.parent = root
    hook.location = (max(xs), 0, 0)
    tris = lib.triangles(body)
    path = os.path.join(out_dir, FILES[name])
    try:
        lib.export(path, [root])
    finally:
        for o in (hook, body, root):
            bpy.data.objects.remove(o, do_unlink=True)
        for other, original in parked:
            other.name = original
    return {"file": FILES[name], "triangles": tris, "nose": max(xs)}


def export_all(out_dir, scene_name="Baits"):
    return {"baits": [export_bait(out_dir, n, scene_name) for n in BAITS]}
