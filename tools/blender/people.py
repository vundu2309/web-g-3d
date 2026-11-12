"""The people of the sea: five casual modern adults (the market vendors and later NPCs).

Everything is lofted by script from cross-section rings (torso, limbs, head, hair, shoes),
then sculpted with smooth Gaussian bumps (bust, nose, lips, eye sockets...). Clothing is
not a second body: each ring of a part takes the colour of what covers it there (trousers,
belt, shirt, skin), and hems, cuffs and waistbands are small steps in the ring radius, so a
tee's sleeve ends in a real hem over a bare arm. Colours come from PAL.people (the game's
palette, palette.json).

Facing -Y in Blender (the pier's -Z, out to sea, after the glTF export). Built in a 1.70 m
frame (about 7.4 heads), then scaled to the look's height. The result is two meshes:
`vendor_body` (everything but the right arm) and `arm_wave` (a pivot at the right shoulder
holding the right arm, so the game can wave it).
"""
import math
import bpy, bmesh
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
import lib
from lib import PAL, mat

PP = PAL["people"]
CL = PP["clothes"]

# --------------------------------------------------------------------------------------------
# The five looks (order of the reference line-up). Ids are the GLB names.
# --------------------------------------------------------------------------------------------
LOOKS = {
    # Cô Lan: slim woman, long dark hair under a non la, cream ao ba ba, black trousers, teal apron
    "people-1": dict(sex="f", height=1.67, girth=0.93, bust=0.8, skin="fair", lip="lip",
                     hair="long", hair_col="black", part=0.0,
                     top="shirt", top_col="babaCream", bottom="trousers", bottom_col="blackPants",
                     shoes="flats", shoe_col="sandal", hat="non", hat_col="hatStraw", apron="apronTeal",
                     left="hang", weight=1),
    # a young woman: short bob, lilac ao ba ba, black trousers, rose apron (spare)
    "people-2": dict(sex="f", height=1.62, girth=1.0, bust=0.9, skin="light", lip="lip",
                     hair="bob", hair_col="dark", part=0.35,
                     top="tee", top_col="babaLilac", bottom="trousers", bottom_col="blackPants",
                     shoes="flats", shoe_col="sandal", apron="apronRose", left="hip", weight=-1, head=(-6, 4)),
    # a woman with a blue head scarf, mustard ao ba ba, dark trousers (spare)
    "people-3": dict(sex="f", height=1.64, girth=0.97, bust=0.85, skin="tan", lip="lip",
                     hair="shoulder", hair_col="dark", part=-0.3,
                     top="shirt", top_col="babaMustard", bottom="trousers", bottom_col="blackPants",
                     shoes="flats", shoe_col="sandal", hat="scarf", hat_col="scarfBlue",
                     left="bent", weight=1, head=(5, -2)),
    # Chú Tư: dark-skinned fisherman, short hair, a faded blue work shirt, brown trousers, flat cap
    "people-4": dict(sex="m", height=1.78, girth=1.04, bust=0.0, skin="deep", lip="lipDeep",
                     hair="short", hair_col="black", part=0.0,
                     top="tee", top_col="fisherShirt", bottom="trousers", bottom_col="fisherPants",
                     shoes="flats", shoe_col="sandal", hat="cap", hat_col="capNavy",
                     left="hang", weight=-1, head=(-3, 0)),
    # Bà Sáu: fuller-figured older woman, grey-streaked hair under a coral scarf, maroon ao ba ba, rose apron
    "people-5": dict(sex="f", height=1.60, girth=1.32, bust=1.3, skin="warm", lip="lip",
                     hair="wavy", hair_col="brown", streak="grey", part=0.25,
                     top="sweater", top_col="babaMaroon", bottom="trousers", bottom_col="blackPants",
                     shoes="flats", shoe_col="sandal", hat="scarf", hat_col="scarfCoral", apron="apronRose",
                     left="bent", weight=1, head=(4, 3)),
}

# --------------------------------------------------------------------------------------------
# Geometry: a mesh accumulator, lofts and Gaussian sculpting.
# --------------------------------------------------------------------------------------------
V = Vector
TAU = 2 * math.pi


class Geo:
    def __init__(self, name):
        self.name = name
        self.v, self.f, self.mats = [], [], []

    def mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def vert(self, p):
        self.v.append(V(p))
        return len(self.v) - 1

    def face(self, idx, m):
        self.f.append((tuple(idx), self.mi(m)))

    def transform(self, M, start=0):
        for i in range(start, len(self.v)):
            self.v[i] = M @ self.v[i]

    def obj(self, recalc=True, flip=False):
        me = bpy.data.meshes.new(self.name)
        me.from_pydata([tuple(p) for p in self.v], [], [f for f, _ in self.f])
        for m in self.mats:
            me.materials.append(m)
        for poly, (_, m) in zip(me.polygons, self.f):
            poly.material_index = m
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        if recalc:
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if flip:
            bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = True
        o = bpy.data.objects.new(self.name, me)
        bpy.context.collection.objects.link(o)
        return o


def frame(t, ref):
    v = ref - t * ref.dot(t)
    if v.length < 1e-6:
        v = V((1, 0, 0)) - t * t.x
    v.normalize()
    return t.cross(v), v


def ring_point(r, a):
    ca, sa = math.cos(a), math.sin(a)
    n = r.get("nf", 2.0) if sa >= 0 else r.get("nb", 2.0)
    e = 2.0 / n
    x = math.copysign(abs(ca) ** e, ca) * r["w"]
    y = math.copysign(abs(sa) ** e, sa) * (r["f"] if sa >= 0 else r["b"])
    if r.get("rib"):
        k = 1 + r["rib"][0] * math.cos(r["rib"][1] * a)
        x, y = x * k, y * k
    return x + r.get("ox", 0.0), y + r.get("oy", 0.0)


def loft(g, rings, angles, ref=V((0, -1, 0)), closed=True, cap0=True, cap1=True, mfn=None):
    """Rings: dicts with c (centre), w (half width), f / b (front / back depth), m (material of
    the band to the next ring), optional nf/nb (superellipse exponents), rib, dz (front dip),
    t (tangent), ref. Returns the vertex index rows."""
    cs = [V(r["c"]) for r in rings]
    rows = []
    for i, r in enumerate(rings):
        if "t" in r:
            t = V(r["t"]).normalized()
        else:
            a, b = cs[max(0, i - 1)], cs[min(len(cs) - 1, i + 1)]
            t = (b - a).normalized()
        u, v = frame(t, V(r.get("ref", ref)))
        row = []
        for a in angles:
            x, y = ring_point(r, a)
            p = cs[i] + u * x + v * y
            if r.get("dz"):
                p = p - t * (r["dz"] * max(0.0, math.sin(a)) ** 2)
            row.append(g.vert(p))
        rows.append(row)
    n = len(angles)
    span = n if closed else n - 1
    for i in range(len(rows) - 1):
        for k in range(span):
            k2 = (k + 1) % n
            m = mfn(i, k) if mfn else None
            g.face((rows[i][k], rows[i][k2], rows[i + 1][k2], rows[i + 1][k]), m or rings[i]["m"])
    if closed:
        for rows_i, ri, sgn, on in ((0, 0, -1, cap0), (-1, -1, 1, cap1)):
            if not on:
                continue
            r = rings[ri]
            a, b = cs[0], cs[1]
            if ri == -1:
                a, b = cs[-2], cs[-1]
            t = (b - a).normalized()
            c = g.vert(cs[ri] + t * sgn * r.get("cap", 0.0))
            row = rows[rows_i]
            for k in range(n):
                g.face((row[k], row[(k + 1) % n], c), r.get("capm", r["m"]))
    return rows


def bump(g, c, s, d, start=0, end=None):
    c, s, d = V(c), V(s), V(d)
    for i in range(start, end if end is not None else len(g.v)):
        p = g.v[i]
        q = ((p.x - c.x) / s.x) ** 2 + ((p.y - c.y) / s.y) ** 2 + ((p.z - c.z) / s.z) ** 2
        if q < 12:
            g.v[i] = p + d * math.exp(-q)


def even(n, a0=0.0):
    return [a0 + TAU * k / n for k in range(n)]


def face_angles(front, back, spread=1.25):
    """Angles dense at the front (pi/2) for faces: `front` samples over +-spread, `back` around."""
    out = []
    for k in range(front):
        t = -1 + 2 * k / (front - 1)
        out.append(math.pi / 2 + spread * (0.45 * t + 0.55 * t ** 3))
    for k in range(1, back + 1):
        out.append(math.pi / 2 + spread + (TAU - 2 * spread) * k / (back + 1))
    return out


def interp(table, z, cols):
    """Linear interpolation of a ring table (first column z ascending)."""
    if z <= table[0][0]:
        row = table[0]
    elif z >= table[-1][0]:
        row = table[-1]
    else:
        for a, b in zip(table, table[1:]):
            if a[0] <= z <= b[0]:
                t = (z - a[0]) / (b[0] - a[0])
                row = [x + (y - x) * t for x, y in zip(a, b)]
                break
    return dict(zip(cols, row[1:]))


def lerp(a, b, t):
    return a + (b - a) * t


def smooth01(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


# --------------------------------------------------------------------------------------------
# Body tables (1.70 m frame; z up, front -Y). Torso rings: z, half width, front, back, y offset.
# --------------------------------------------------------------------------------------------
TORSO = {
    "f": [
        (0.795, 0.060, 0.050, 0.058, 0.0),
        (0.83, 0.128, 0.080, 0.096, 0.0),
        (0.88, 0.158, 0.088, 0.116, 0.004),
        (0.94, 0.162, 0.085, 0.112, 0.004),
        (1.00, 0.146, 0.078, 0.094, 0.0),
        (1.06, 0.122, 0.072, 0.080, 0.0),
        (1.12, 0.124, 0.076, 0.079, 0.0),
        (1.18, 0.132, 0.084, 0.080, 0.0),
        (1.24, 0.138, 0.088, 0.082, 0.0),
        (1.30, 0.142, 0.084, 0.083, 0.0),
        (1.35, 0.148, 0.076, 0.082, 0.0),
        (1.39, 0.150, 0.066, 0.074, 0.0),
        (1.42, 0.122, 0.056, 0.062, 0.0),
        (1.44, 0.074, 0.048, 0.054, -0.004),
        (1.465, 0.050, 0.045, 0.050, -0.010),
        (1.52, 0.047, 0.043, 0.047, -0.018),
        (1.58, 0.044, 0.040, 0.044, -0.024),
    ],
    "m": [
        (0.795, 0.062, 0.050, 0.056, 0.0),
        (0.83, 0.128, 0.082, 0.088, 0.0),
        (0.88, 0.148, 0.088, 0.098, 0.003),
        (0.94, 0.150, 0.088, 0.096, 0.003),
        (1.00, 0.147, 0.086, 0.090, 0.0),
        (1.06, 0.143, 0.086, 0.086, 0.0),
        (1.12, 0.147, 0.088, 0.086, 0.0),
        (1.18, 0.156, 0.094, 0.088, 0.0),
        (1.24, 0.165, 0.098, 0.092, 0.0),
        (1.30, 0.172, 0.096, 0.094, 0.0),
        (1.35, 0.178, 0.088, 0.092, 0.0),
        (1.395, 0.178, 0.074, 0.082, 0.0),
        (1.425, 0.142, 0.062, 0.068, 0.0),
        (1.447, 0.082, 0.054, 0.060, -0.004),
        (1.47, 0.058, 0.052, 0.056, -0.010),
        (1.52, 0.055, 0.050, 0.053, -0.018),
        (1.58, 0.050, 0.046, 0.050, -0.024),
    ],
}
SKELETON = {
    "f": dict(shoulder=0.148, hip=0.083, upper=0.285, fore=0.245, hand=1.0),
    "m": dict(shoulder=0.176, hip=0.088, upper=0.30, fore=0.26, hand=1.1),
}
HEAD_C = V((0.0, -0.03, 1.588))  # the head's centre (eye height) in the 1.70 m frame


class Person:
    def __init__(self, look):
        self.L = look
        self.sex = look["sex"]
        self.g = look["girth"]
        self.objs, self.keep, self.wave = [], [], []
        L = look
        self.SKIN = mat("skin-" + L["skin"], PP["skin"][L["skin"]], 0.5)
        self.HAIR = mat("hair-" + L["hair_col"], PP["hair"][L["hair_col"]], 0.5)
        self.STREAK = mat("hair-" + L["streak"], PP["hair"][L["streak"]], 0.5) if L.get("streak") else None
        self.LIP = mat("lip-" + L["lip"], PP["face"][L["lip"]], 0.45)
        self.IRIS = mat("iris", PP["face"]["iris"], 0.3)
        self.WHITE = mat("eyewhite", PP["face"]["white"], 0.3)
        self.LASH = mat("lash", PP["face"]["lash"], 0.5)
        c = lambda k: mat(k, CL[k], 0.8)
        top = L["top"]
        if top == "shirt":
            self.TOP, self.SLEEVE = c(L.get("top_col", "shirt")), c(L.get("top_col", "shirt"))
        elif top == "tee":
            self.TOP = self.SLEEVE = c(L["top_col"])
        elif top == "jacket":
            self.TOP, self.SLEEVE = c("top"), c("jacket")
            self.JACKET, self.ZIP = c("jacket"), c("zip")
        else:
            self.TOP = self.SLEEVE = c(L.get("top_col", "knit"))
        b = L["bottom"]
        self.BOTTOM = (c(L["bottom_col"]) if "bottom_col" in L else
                       c("khaki") if b == "trousers" else c("shorts") if b == "shorts" else c(L.get("jeans_col", "jeans")))
        self.BELT = mat("belt", PAL["fit"]["belt"], 0.5)
        self.SHOE = c(L.get("shoe_col", "flats")) if L["shoes"] == "flats" else c(L["shoe_col"])
        self.SOLE = c("sole")
        self.SOCK = c("sock")
        self.BUTTON = c("button")
        self.APRON = c(L["apron"]) if L.get("apron") else None
        self.HATM = c(L["hat_col"]) if L.get("hat") else None
        sk = SKELETON[self.sex]
        self.sk = sk
        self.shift = 0.012 * L["weight"]  # hips toward the weight-bearing leg

    def add(self, g, keep=False, wave=False, **kw):
        o = g.obj(**kw)
        (self.wave if wave else self.objs).append(o)
        if keep:
            self.keep.append(o)
        return o

    # ---- torso and neck, with the clothes as coloured bands --------------------------------
    def torso_table(self):
        g = self.g
        out = []
        for z, w, f, b, oy in TORSO[self.sex]:
            k = g if z < 1.43 else 1 + (g - 1) * 0.5
            out.append((z, w * k, f * k, b * k, oy))
        return out

    def torso_ring(self, z):
        r = interp(self.torso_table(), z, ("w", "f", "b", "oy"))
        x = self.shift * smooth01((1.30 - z) / 0.4)
        return r, V((x, r["oy"], z))

    def torso(self):
        L = self.L
        top, bottom = L["top"], L["bottom"]
        # (z, what covers the band above it, extra radius, rib)
        zs = [0.795, 0.815, 0.84, 0.88, 0.93, 0.99, 1.06, 1.12, 1.18, 1.24, 1.30, 1.35, 1.39, 1.415,
              1.435, 1.452, 1.475, 1.53, 1.58]
        rings = []
        if top == "shirt":
            bands = [(1.025, "belt"), (1.05, "top")]
            neck_z, dz = 1.425, 0.07
        elif top == "tee":
            bands = [(0.93, "top")]
            neck_z, dz = 1.44, 0.03
        elif top == "jacket":
            bands = [(0.975, "top")]
            neck_z, dz = 1.44, 0.045
        else:
            bands = [(0.915, "top")]
            neck_z, dz = 1.445, 0.025
        hem_z = bands[-1][0]
        ease_top = {"shirt": 0.006, "tee": 0.006, "jacket": 0.004, "sweater": 0.016}[top]
        for z, _ in bands:
            zs += [z - 0.002, z, z + 0.012]
        zs += [neck_z - 0.004, neck_z, neck_z + 0.002]
        zs = sorted(set(round(z, 4) for z in zs))
        for z in zs:
            r, c = self.torso_ring(z)
            what = "bottom"
            for bz, name in bands:
                if z >= bz:
                    what = name
            if z >= neck_z + 0.001:
                what = "skin"
            ease = 0.0
            if what == "top":
                ease = ease_top * smooth01((neck_z - 0.02 - z) / 0.05)
                if abs(z - hem_z) < 0.0005 or abs(z - (hem_z + 0.012)) < 0.0005:
                    ease += 0.005  # the hem lip
            if what == "belt":
                ease = 0.005
            if what == "bottom" and bottom != "shorts":
                ease = 0.002
            m = {"bottom": self.BOTTOM, "belt": self.BELT, "top": self.TOP, "skin": self.SKIN}[what]
            ring = dict(c=c, w=r["w"] + ease, f=r["f"] + ease, b=r["b"] + ease, m=m, nf=2.2, nb=2.3)
            if what == "top" and top == "sweater" and z < hem_z + 0.013:
                ring["rib"] = (0.012, 24)
            if abs(z - neck_z) < 0.003 or abs(z - (neck_z - 0.004)) < 0.001:
                ring["dz"] = dz
                if z < neck_z + 0.0005:
                    ring["w"] += 0.004
                    ring["f"] += 0.004
                    ring["b"] += 0.004
            rings.append(ring)
        rings[0]["cap"] = 0.02
        g = Geo("torso")
        loft(g, rings, even(18), ref=V((0, -1, 0)))
        # the body's shape under the clothes: bust, seat, shoulder blades, collar bones
        k = self.g
        if self.L["bust"]:
            bs = self.L["bust"]
            for s in (-1, 1):
                bump(g, (s * 0.075 * k, -0.09 * k, 1.245), (0.055 * k, 0.06, 0.05 * k), (0, -0.026 * bs, -0.006 * bs))
        else:
            for s in (-1, 1):
                bump(g, (s * 0.07, -0.1, 1.29), (0.06, 0.06, 0.05), (0, -0.008, 0))
        for s in (-1, 1):
            bump(g, (s * 0.07 * k, 0.11 * k, 0.88), (0.065 * k, 0.06, 0.07), (0, 0.016 * (1.4 if self.sex == "f" else 0.8), 0))
            bump(g, (s * 0.07, 0.07, 1.32), (0.05, 0.05, 0.06), (0, 0.006, 0))
        if self.sex == "f":  # a softer belly line at the waist for the fuller look
            bump(g, (0, -0.085 * k, 1.0), (0.09 * k, 0.05, 0.06), (0, -0.012 * (k - 0.9) * 2, 0))
        self.torso_geo = g
        o = self.add(g)
        self.torso_obj = o
        return o, neck_z

    # ---- collars, plackets, jacket ---------------------------------------------------------
    def collar_shirt(self, neck_z):
        g = Geo("collar")
        ang = [math.pi / 2 + 0.42 + (TAU - 0.84) * k / 14 for k in range(15)]
        rings = []
        for z, w, f, b, dz in ((neck_z - 0.012, 0.066, 0.058, 0.066, 0.03), (neck_z + 0.03, 0.058, 0.054, 0.060, 0.03),
                               (neck_z + 0.034, 0.064, 0.060, 0.066, 0.034), (neck_z + 0.004, 0.084, 0.076, 0.082, 0.06),
                               (neck_z - 0.014, 0.096, 0.082, 0.088, 0.09)):
            r, c = self.torso_ring(z)
            c = V((c.x, c.y, z))
            rings.append(dict(c=c, w=w * (1 + (self.g - 1) * 0.5), f=f, b=b, m=self.TOP, dz=dz, t=(0, 0, 1)))
        loft(g, rings, ang, closed=False)
        o = self.add(g, recalc=False)
        md = o.modifiers.new("s", "SOLIDIFY")
        md.thickness = 0.004
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier="s")
        # buttons down the placket
        bvh = BVHTree.FromObject(self.torso_obj, bpy.context.evaluated_depsgraph_get())
        for z in (1.33, 1.25, 1.17, 1.09):
            hit = bvh.ray_cast(V((self.torso_ring(z)[1].x, -0.4, z)), V((0, 1, 0)))
            if hit[0] is not None:
                b = lib.Build(False).ball(0.0055, hit[0] + V((0, -0.002, 0)), self.BUTTON, (1, 0.45, 1), seg=6, rings=4)
                self.objs.append(b)

    def jacket(self):
        """An open zip jacket over the top: a shell around the torso, open in front, with zip trims."""
        g = Geo("jacket")
        gap = 0.32
        n = 20
        ang = [math.pi / 2 + gap + (TAU - 2 * gap) * k / (n - 1) for k in range(n)]
        zs = [0.955, 0.96, 0.975, 1.02, 1.10, 1.18, 1.25, 1.32, 1.39, 1.415, 1.435, 1.45, 1.475, 1.49]
        rings = []
        for z in zs:
            r, c = self.torso_ring(min(z, 1.432))
            e = 0.014 if z < 1.40 else 0.012
            w, f, b = r["w"] + e, r["f"] + e, r["b"] + e
            if z <= 0.976:
                w, f, b = w + 0.004, f + 0.004, b + 0.004
            if z > 1.43:  # the standing collar
                w, f, b = 0.064 * (1 + (self.g - 1) * 0.5), 0.058, 0.064
                c = V((c.x, -0.012, z))
            if self.L["bust"] and 1.18 <= z <= 1.30:
                f += 0.014 * self.L["bust"]
            rings.append(dict(c=c, w=w, f=f, b=b, m=self.JACKET, nf=2.2, nb=2.3, t=(0, 0, 1)))

        def mfn(i, k):
            if k == 0 or k == n - 2:
                return self.ZIP
            if zs[i] < 0.974:
                return self.ZIP
            return None
        loft(g, rings, ang, closed=False, mfn=mfn)
        o = self.add(g, recalc=False)
        # face normals outward
        bpy.context.view_layer.objects.active = o
        md = o.modifiers.new("s", "SOLIDIFY")
        md.thickness = 0.006
        md.offset = 1
        bpy.ops.object.modifier_apply(modifier="s")
        self._fix_normals(o, V((0, 0, 1.2)))

    def _fix_normals(self, o, centre):
        """Make an open shell's normals point away from `centre` (in the xy plane)."""
        me = o.data
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.normal_update()
        score = 0.0
        for f in bm.faces:
            d = f.calc_center_median() - centre
            d.z = 0
            score += f.normal.dot(d) * f.calc_area()
        if score < 0:
            bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()

    # ---- arms and hands --------------------------------------------------------------------
    def arm_points(self, side, pose):
        sk = self.sk
        z = 1.37 if self.sex == "f" else 1.375
        S = V((side * sk["shoulder"] * (1 + (self.g - 1) * 0.6), 0.004, z))
        S.x += self.shift * 0.2
        ab1, fl1, ab2, fl2, ab3, fl3 = pose
        dirv = lambda ab, fl: V((side * math.sin(ab) * math.cos(fl), -math.sin(fl), -math.cos(ab) * math.cos(fl))).normalized()
        d1 = dirv(math.radians(ab1), math.radians(fl1))
        E = S + d1 * sk["upper"]
        d2 = dirv(math.radians(ab2), math.radians(fl2))
        W = E + d2 * sk["fore"]
        d3 = dirv(math.radians(ab3), math.radians(fl3))
        return S, E, W, d1, d2, d3

    def arm(self, side, pose, wave=False):
        L, k = self.L, self.g
        S, E, W, d1, d2, d3 = self.arm_points(side, pose)
        man = self.sex == "m"
        mk = 1.12 if man else 1.0
        # (segment, t, w (across), f, b): w is across the body (x), f/b front/back (y)
        prof = [
            (0, -0.09, 0.020, 0.020, 0.020),
            (0, -0.05, 0.036, 0.036, 0.037),
            (0, 0.01, 0.041, 0.040, 0.042),
            (0, 0.10, 0.042, 0.040, 0.043),
            (0, 0.30, 0.040, 0.040, 0.043),
            (0, 0.55, 0.036, 0.036, 0.040),
            (0, 0.80, 0.033, 0.033, 0.036),
            (1, 0.00, 0.031, 0.031, 0.036),
            (1, 0.15, 0.034, 0.036, 0.035),
            (1, 0.38, 0.030, 0.034, 0.031),
            (1, 0.62, 0.024, 0.028, 0.026),
            (1, 0.85, 0.019, 0.025, 0.023),
            (1, 1.00, 0.017, 0.025, 0.023),
            (1, 1.08, 0.016, 0.024, 0.022),
        ]
        top = L["top"]
        sleeve_end = {"shirt": (1, 0.40), "tee": (0, 0.42 if not man else 0.45), "jacket": (1, 0.93),
                      "sweater": (1, 0.94)}[top]
        ease = {"shirt": 0.007, "tee": 0.012, "jacket": 0.010, "sweater": 0.012}[top]
        cuff_len = {"shirt": 0.05, "tee": 0.0, "jacket": 0.07, "sweater": 0.08}[top]
        rings = []
        segs = [(S, E), (E, W)]

        def at(seg, t):
            a, b = segs[seg]
            if seg == 0 and t < 0:
                return a + (b - a).normalized() * (t * (b - a).length)
            if seg == 1 and t > 1:
                return b + (b - a).normalized() * ((t - 1) * (b - a).length)
            return a.lerp(b, t)

        def key(seg, t):
            return seg + t

        end_key = key(*sleeve_end)
        # insert cuff / hem rings
        extra = [(sleeve_end[0], sleeve_end[1] - 0.001), (sleeve_end[0], sleeve_end[1] + 0.001)]
        if cuff_len:
            seg_len = (segs[sleeve_end[0]][1] - segs[sleeve_end[0]][0]).length
            extra.append((sleeve_end[0], sleeve_end[1] - cuff_len / seg_len))
            extra.append((sleeve_end[0], sleeve_end[1] - cuff_len / seg_len - 0.002))
        allp = sorted(prof + [(s, t) + self._arm_interp(prof, s, t) for s, t in extra], key=lambda p: key(p[0], p[1]))
        for i, (seg, t, w, f, b) in enumerate(allp):
            kk = key(seg, t)
            w, f, b = w * k * mk, f * k * mk, b * k * mk
            clothed = kk <= end_key - 0.0005
            m = self.SLEEVE if clothed else self.SKIN
            if clothed:
                e = ease * smooth01((kk - 0.0) / 0.12)
                cuff_start = end_key - (cuff_len / (segs[sleeve_end[0]][1] - segs[sleeve_end[0]][0]).length if cuff_len else 0)
                if cuff_len and kk >= cuff_start - 0.0015:
                    e = ease * 0.7 if top in ("jacket", "sweater") else ease + 0.006
                    if top == "shirt":
                        e = ease + 0.008
                elif not cuff_len and kk >= end_key - 0.004:
                    e = ease + 0.004
                if top in ("jacket", "sweater") and kk < cuff_start - 0.002 and kk > 0.9:
                    e = ease * 1.25  # a looser sleeve bunching above the cuff
                w, f, b = w + e, f + e, b + e
            if seg == 0 and t < 0 and top != "shirt":
                pass
            r = dict(c=at(seg, t), w=w, f=f, b=b, m=m)
            if clothed and top == "sweater" and kk >= end_key - 0.08:
                r["rib"] = (0.04, 8)
            rings.append(r)
        rings[0]["cap"] = 0.012
        rings[-1]["cap"] = 0.0
        g = Geo("arm")
        loft(g, rings, even(9), ref=V((0, -1, 0)))
        o = self.add(g, wave=wave)
        self.hand(side, W, d3, wave)
        return S

    def _arm_interp(self, prof, s, t):
        kk = s + t
        pts = [(p[0] + p[1], p[2:]) for p in prof]
        for (k0, a), (k1, b) in zip(pts, pts[1:]):
            if k0 <= kk <= k1:
                u = (kk - k0) / (k1 - k0)
                return tuple(x + (y - x) * u for x, y in zip(a, b))
        return pts[-1][1]

    def hand(self, side, W, d, wave):
        """A relaxed hand: palm, four curled fingers and a thumb (built as a right hand: fingers -Z,
        palm +X, thumb -Y, then mirrored for the left and turned along the forearm)."""
        g = Geo("hand")
        hs = self.sk["hand"] * (1 + (self.g - 1) * 0.4)
        palm = [(0.012, 0.016, 0.012, 0.012), (-0.01, 0.024, 0.014, 0.013), (-0.04, 0.034, 0.016, 0.013),
                (-0.07, 0.038, 0.014, 0.012), (-0.088, 0.036, 0.011, 0.011)]
        rings = [dict(c=V((0, 0, z)), w=w, f=f, b=b, m=self.SKIN, nf=2.6, nb=2.6) for z, w, f, b in palm]
        rings[-1]["cap"] = 0.004
        loft(g, rings, even(8), ref=V((1, 0, 0)))
        fingers = [(-0.025, -0.084, (0.034, 0.022, 0.017), 0.0086, -0.10, 0),
                   (-0.0085, -0.089, (0.038, 0.024, 0.018), 0.0088, -0.03, 1),
                   (0.008, -0.087, (0.035, 0.022, 0.017), 0.0083, 0.04, 2),
                   (0.024, -0.081, (0.027, 0.018, 0.015), 0.0072, 0.12, 3)]
        for y, z, lens, rad, spread, i in fingers:
            p = V((0.0, y, z + 0.006))
            dvec = V((0.0, spread, -1.0)).normalized()
            pts, rads = [p.copy()], [rad]
            curl = [math.radians(a + 6 * i) for a in (14, 26, 18)]
            for L_, c_, rr in zip(lens, curl, (0.97, 0.88, 0.78)):
                # curl toward the palm (+X)
                dvec = (dvec + V((math.sin(c_) * 0.9, 0, 0))).normalized()
                p = p + dvec * L_
                pts.append(p.copy()); rads.append(rad * rr)
            rs = [dict(c=q, w=r_, f=r_ * 0.9, b=r_ * 0.95, m=self.SKIN) for q, r_ in zip(pts, rads)]
            rs[-1]["cap"] = rads[-1] * 0.9
            loft(g, rs, even(5, 0.3), ref=V((1, 0, 0)))
        # thumb
        p = V((0.006, -0.018, -0.012))
        dv = V((0.38, -0.55, -0.74)).normalized()
        pts, rads = [p - dv * 0.01, p], [0.012, 0.0115]
        for L_, rr, bend in ((0.033, 0.0105, 0.25), (0.027, 0.0088, 0.35)):
            dv = (dv + V((0.25, 0.12, -bend))).normalized()
            p = p + dv * L_
            pts.append(p.copy()); rads.append(rr)
        rs = [dict(c=q, w=r_, f=r_ * 0.85, b=r_ * 0.85, m=self.SKIN) for q, r_ in zip(pts, rads)]
        rs[-1]["cap"] = rads[-1] * 0.8
        loft(g, rs, even(5, 0.3), ref=V((1, 0, 0)))
        M = Matrix.Diagonal((hs, hs, hs, 1))
        if side > 0:
            M = Matrix.Diagonal((-1, 1, 1, 1)) @ M
        R = V((0, 0, -1)).rotation_difference(d).to_matrix().to_4x4()
        g.transform(Matrix.Translation(W) @ R @ M)
        self.add(g, wave=wave)

    # ---- legs and shoes --------------------------------------------------------------------
    def leg(self, side):
        L, k = self.L, self.g
        weight = (L["weight"] == side)
        hx = self.sk["hip"] * (1 + (self.g - 1) * 0.7)
        H = V((side * hx + self.shift, 0.0, 0.90))
        if weight:
            K = V((side * (hx - 0.012) + self.shift * 0.6, -0.006, 0.48))
            A = V((side * (hx - 0.016), 0.010, 0.085))
        else:
            K = V((side * (hx - 0.020), -0.042, 0.492))
            A = V((side * (hx + 0.006), -0.010, 0.088))
        man = self.sex == "m"
        mk = 1.08 if man else 1.0
        prof = [
            (0, -0.07, 0.070, 0.056, 0.072),
            (0, 0.00, 0.086, 0.070, 0.088),
            (0, 0.10, 0.084, 0.076, 0.086),
            (0, 0.25, 0.080, 0.076, 0.080),
            (0, 0.50, 0.069, 0.066, 0.066),
            (0, 0.75, 0.058, 0.056, 0.053),
            (0, 0.92, 0.052, 0.053, 0.048),
            (1, 0.00, 0.050, 0.052, 0.047),
            (1, 0.12, 0.050, 0.047, 0.055),
            (1, 0.30, 0.049, 0.044, 0.058),
            (1, 0.52, 0.040, 0.038, 0.045),
            (1, 0.74, 0.032, 0.032, 0.035),
            (1, 0.90, 0.029, 0.030, 0.032),
            (1, 1.00, 0.028, 0.030, 0.033),
            (1, 1.30, 0.026, 0.030, 0.030),
        ]
        segs = [(H, K), (K, A)]
        b = L["bottom"]
        if b == "trousers":
            hem, ease, straight = (1, 0.90), 0.010, 0.052
        elif b == "jeans":
            hem, ease, straight = (1, 0.88), 0.007, 0.045
        else:
            hem, ease, straight = (0, 0.36), 0.016, 0.0
        sock = (1, 0.80) if L.get("socks") else None
        extra = [(hem[0], hem[1] - 0.04), (hem[0], hem[1] - 0.003), (hem[0], hem[1]), (hem[0], hem[1] + 0.002)]
        if sock:
            extra += [(sock[0], sock[1]), (sock[0], sock[1] + 0.03)]
        pts = sorted(prof + [(s, t) + self._arm_interp(prof, s, t) for s, t in extra], key=lambda p: p[0] + p[1])
        rings = []
        for seg, t, w, f, bb in pts:
            kk = seg + t
            w, f, bb = w * k * mk, f * k * mk, bb * k * mk
            a, c = segs[seg]
            pos = a.lerp(c, t) if 0 <= t <= 1 else a + (c - a) * t
            clothed = kk <= hem[0] + hem[1] + 0.0005
            if clothed:
                e = ease
                if kk >= hem[0] + hem[1] - 0.0035:
                    e += 0.004
                if straight and seg == 1:
                    w, f, bb = max(w, straight), max(f, straight * 0.95), max(bb, straight)
                if b == "shorts":
                    e += 0.01 * t / 0.36  # a slight flare
                w, f, bb = w + e, f + e, bb + e
                m = self.BOTTOM
            else:
                m = self.SOCK if sock and kk >= sock[0] + sock[1] else self.SKIN
                if m is self.SOCK:
                    w, f, bb = w + 0.003, f + 0.003, bb + 0.003
            rings.append(dict(c=pos, w=w, f=f, b=bb, m=m))
        rings[0]["cap"] = 0.02
        g = Geo("leg")
        loft(g, rings, even(11), ref=V((0, -1, 0)))
        self.add(g)
        self.shoe(side, A, weight)

    def shoe(self, side, A, weight):
        flats = self.L["shoes"] == "flats"
        s = 1.0 if self.sex == "f" else 1.12
        if flats:
            tab = [(0.060, 0.026, 0.017, 0.014, 0.022), (0.050, 0.028, 0.030, 0.020, 0.027),
                   (0.020, 0.027, 0.034, 0.022, 0.027), (-0.020, 0.024, 0.036, 0.022, 0.024),
                   (-0.070, 0.021, 0.039, 0.019, 0.021), (-0.120, 0.019, 0.038, 0.016, 0.019),
                   (-0.160, 0.018, 0.030, 0.012, 0.018), (-0.180, 0.018, 0.015, 0.008, 0.012)]
            sole_z = 0.007
        else:
            tab = [(0.066, 0.040, 0.020, 0.020, 0.030), (0.058, 0.044, 0.036, 0.040, 0.040),
                   (0.030, 0.047, 0.042, 0.050, 0.044), (-0.010, 0.042, 0.044, 0.044, 0.040),
                   (-0.060, 0.034, 0.047, 0.034, 0.033), (-0.110, 0.030, 0.047, 0.026, 0.029),
                   (-0.150, 0.028, 0.042, 0.021, 0.027), (-0.178, 0.028, 0.030, 0.016, 0.025),
                   (-0.193, 0.030, 0.014, 0.009, 0.016)]
            sole_z = 0.021
        g = Geo("shoe")
        rings = [dict(c=V((0, y * s, z)), w=w * s, f=f * s, b=b, m=self.SHOE, nf=2.2, nb=5.0, t=(0, -1, 0))
                 for y, z, w, f, b in tab]
        rings[0]["cap"] = 0.006
        rings[-1]["cap"] = 0.006
        loft(g, rings, even(12, 0.26), ref=V((0, 0, 1)))
        for i, p in enumerate(g.v):
            if p.z < 0:
                g.v[i] = V((p.x, p.y, 0.0))
        # sole, laces and the heel tab by position
        new = []
        for idx, m in g.f:
            ctr = sum((g.v[i] for i in idx), V()) / len(idx)
            mm = g.mats[m]
            if ctr.z < sole_z:
                mm = self.SOLE
            elif not flats and -0.085 * s < ctr.y < -0.005 and ctr.z > 0.058 and abs(ctr.x) < 0.02:
                mm = self.SOLE
            new.append((idx, g.mi(mm)))
        g.f = new
        if flats:  # the instep shows above a flat
            foot = [(0.03, 0.050, 0.026, 0.030, 0.03), (-0.01, 0.040, 0.030, 0.030, 0.03),
                    (-0.05, 0.028, 0.032, 0.022, 0.02), (-0.08, 0.022, 0.030, 0.012, 0.012)]
            loft(g, [dict(c=V((0, y, z)), w=w, f=f, b=b, m=self.SKIN, t=(0, -1, 0)) for y, z, w, f, b in foot],
                 even(8), ref=V((0, 0, 1)))
        turn = math.radians(9 if weight else 15) * side
        T = Matrix.Translation(V((A.x, A.y, 0))) @ Matrix.Rotation(turn, 4, "Z")
        g.transform(T)
        self.add(g)

    # ---- head ------------------------------------------------------------------------------
    def head(self):
        man = self.sex == "m"
        full = self.g > 1.1
        wk = 1.06 if man else (1.05 if full else 1.0)
        # z, half width, front, back, front exponent
        tab = [
            (-0.112, 0.012, 0.050, 0.010, 2.0),
            (-0.106, 0.024, 0.062, 0.016, 2.0),
            (-0.098, 0.032, 0.069, 0.024, 2.1),
            (-0.088, 0.041 * (1.08 if man else 1), 0.075, 0.032, 2.2),
            (-0.076, 0.049 * (1.07 if man else 1), 0.080, 0.042, 2.3),
            (-0.066, 0.054, 0.083, 0.052, 2.4),
            (-0.058, 0.058, 0.085, 0.060, 2.5),
            (-0.050, 0.062, 0.086, 0.068, 2.5),
            (-0.038, 0.066, 0.087, 0.080, 2.6),
            (-0.026, 0.069, 0.088, 0.088, 2.7),
            (-0.014, 0.071, 0.088, 0.093, 2.8),
            (-0.004, 0.072, 0.088, 0.096, 2.8),
            (0.006, 0.073, 0.091, 0.098, 2.7),
            (0.020, 0.074, 0.093, 0.100, 2.6),
            (0.038, 0.074, 0.091, 0.101, 2.5),
            (0.060, 0.071, 0.085, 0.098, 2.4),
            (0.082, 0.065, 0.075, 0.090, 2.3),
            (0.100, 0.054, 0.060, 0.074, 2.2),
            (0.112, 0.037, 0.040, 0.050, 2.2),
            (0.119, 0.014, 0.014, 0.016, 2.0),
        ]
        zs = [-0.112, -0.100, -0.088, -0.078, -0.0705, -0.0645, -0.060, -0.0565, -0.053, -0.049, -0.044,
              -0.038, -0.031, -0.023, -0.015, -0.007, 0.001, 0.010, 0.021, 0.040, 0.065, 0.091, 0.109]
        rows = []
        for z in zs:
            r = interp(tab, z, ("w", "f", "b", "nf"))
            rows.append(dict(c=V((0, 0, z)), w=r["w"] * wk, f=r["f"], b=r["b"], nf=r["nf"], nb=2.0, m=self.SKIN,
                             t=(0, 0, 1)))
        rows[0]["cap"] = 0.0
        rows[-1]["cap"] = 0.003
        g = Geo("head")
        loft(g, rows, face_angles(15, 8), ref=V((0, -1, 0)))
        # sculpt: eye sockets, brow, nose, cheeks, lips, chin
        for s in (-1, 1):
            bump(g, (s * 0.032, -0.09, -0.003), (0.016, 0.03, 0.010), (0, 0.011, 0))
            bump(g, (s * 0.034, -0.09, 0.016), (0.024, 0.03, 0.008), (0, -0.003, 0.0))
            bump(g, (s * 0.052, -0.07, -0.026), (0.02, 0.03, 0.016), (s * 0.002, -0.005, 0))
            bump(g, (s * 0.012, -0.09, -0.036), (0.007, 0.03, 0.006), (s * 0.003, -0.007, 0))   # nostril wings
            bump(g, (s * 0.024, -0.085, -0.058), (0.006, 0.03, 0.008), (0, 0.004, 0))           # mouth corners
            bump(g, (s * 0.045, -0.06, -0.082), (0.02, 0.03, 0.012), (s * 0.002 * (2 if man else 1), 0, 0))  # jaw
        nose = 1.1 if man else 1.0
        bump(g, (0, -0.09, -0.004), (0.008, 0.04, 0.010), (0, -0.009 * nose, 0))
        bump(g, (0, -0.09, -0.017), (0.009, 0.04, 0.010), (0, -0.016 * nose, 0))
        bump(g, (0, -0.09, -0.030), (0.0115, 0.04, 0.008), (0, -0.022 * nose, -0.002))
        bump(g, (0, -0.09, -0.041), (0.012, 0.04, 0.004), (0, 0.004, 0))
        bump(g, (0, -0.09, -0.0505), (0.018, 0.04, 0.0055), (0, -0.0055, 0))  # upper lip
        bump(g, (0, -0.09, -0.0625), (0.016, 0.04, 0.0055), (0, -0.0055, 0))  # lower lip
        bump(g, (0, -0.09, -0.0565), (0.024, 0.04, 0.0020), (0, 0.0035, 0))   # mouth line
        bump(g, (0, -0.08, -0.069), (0.016, 0.03, 0.004), (0, 0.003, 0))      # under the lip
        bump(g, (0, -0.08, -0.095), (0.016 * (1.3 if man else 1), 0.03, 0.010), (0, -0.006, -0.002))  # chin
        turn, tilt = self.L.get("head", (0, 0))
        H = (Matrix.Translation(HEAD_C) @ Matrix.Rotation(math.radians(turn), 4, "Z")
             @ Matrix.Rotation(math.radians(tilt), 4, "Y") @ Matrix.Rotation(math.radians(3), 4, "X"))
        self.head_M = H
        g.transform(H)
        head = self.add(g, keep=True)
        self.head_obj = head
        bvh = BVHTree.FromObject(head, bpy.context.evaluated_depsgraph_get())
        self.head_bvh = bvh

        def surf(x, z, y0=-0.3):
            o = H @ V((x, y0, z))
            d = (H.to_3x3() @ V((0, 1, 0))).normalized()
            hit = bvh.ray_cast(o, d)
            return hit[0], hit[1]

        # eyes: white, iris, upper lid with the lash line, lower lid, brows
        B = lib.Build(False)
        er = 0.0118
        for s in (-1, 1):
            ex, ez = s * 0.0315, -0.003
            p, n = surf(ex, ez)
            ctr_l = H.inverted() @ p + V((0, er - 0.0058, 0))
            ctr = H @ ctr_l
            eye = B.ball(er, ctr, self.WHITE, seg=12, rings=8)
            self.objs.append(eye); self.keep.append(eye)
            fwd = (H.to_3x3() @ V((-s * 0.03, -1, 0.0))).normalized()
            iris = B.ball(0.0064, ctr + fwd * (er - 0.0012), self.IRIS, (1, 1, 1), seg=10, rings=6)
            # flatten the iris along the gaze
            q = fwd.to_track_quat("Z", "Y").to_matrix().to_4x4()
            me = iris.data
            for v in me.vertices:
                lv = q.inverted() @ (v.co - (ctr + fwd * (er - 0.0012)))
                lv.z *= 0.35
                v.co = (ctr + fwd * (er - 0.0012)) + q @ lv
            self.objs.append(iris); self.keep.append(iris)
            # lids: shells over the top and bottom of the eyeball
            lg = Geo("lid")
            for upper in (True, False):
                start = len(lg.v)
                lid_rows = []
                n_a = 8
                for j in range(4):
                    # polar angle from the lid's top: rows go from inside the socket to the lid edge
                    # rows from deep in the socket to the lid's edge (upper lid edge a little above
                    # the eye's centre, so it rests over the top of the iris)
                    el = math.radians((80, 52, 30, 13)[j] if upper else (-80, -55, -36, -27)[j])
                    row = []
                    for i in range(n_a):
                        az = math.radians(-82 + 164 * i / (n_a - 1))
                        rr = er * (1.13 if j < 2 else 1.09 if j == 2 else 1.05)
                        # the lid edge curves: highest over the iris, down at the corners
                        e2 = el - (math.radians(10) * (abs(az) / 1.43) ** 2 if j == 3 and upper else 0)
                        e2 = e2 + (math.radians(8) * (abs(az) / 1.43) ** 2 if j == 3 and not upper else 0)
                        lp = V((math.sin(az) * math.cos(e2), -math.cos(az) * math.cos(e2), math.sin(e2)))
                        tilt = 0.0025 * s * math.sin(az)  # outer corners slightly up
                        row.append(lg.vert(ctr_l + lp * rr + V((0, 0, tilt))))
                    lid_rows.append(row)
                if upper:
                    # sweep the lid from up/back to the lid edge (lower the edge as j grows)
                    pass
                for j in range(3):
                    for i in range(n_a - 1):
                        lg.face((lid_rows[j][i], lid_rows[j][i + 1], lid_rows[j + 1][i + 1], lid_rows[j + 1][i]),
                                self.SKIN)
                if upper:
                    edge = lid_rows[3]
                    lash = Geo("lash")
                    pts = [lg.v[i] for i in edge]
                    rs = [dict(c=p, w=0.0010 + 0.0009 * math.sin(math.pi * i / (len(pts) - 1)) + 0.0004 * (s * (lg.v[edge[i]].x - ctr_l.x) > 0),
                               f=0.0015, b=0.0010, m=self.LASH, ref=(0, 0, 1)) for i, p in enumerate(pts)]
                    loft(lash, rs, even(3, 0.5), ref=V((0, 0, 1)))
                    lash.transform(H)
                    self.add(lash, keep=True)
            lg.transform(H)
            lo = self.add(lg, keep=True)
            self._fix_normals(lo, H @ ctr_l)
            # brow: a tapered strip following the brow ridge
            bg = Geo("brow")
            pts = []
            for i in range(6):
                t = i / 5
                bx = s * (0.012 + 0.040 * t)
                bz = 0.015 + 0.007 * math.sin(math.pi * min(1, t * 1.25)) - 0.004 * t
                p, _ = surf(bx, bz)
                pts.append(p + (H.to_3x3() @ V((0, -0.0012, 0))))
            th = 0.0034 if not man else 0.0048
            rs = [dict(c=p, w=th * (1 - 0.55 * i / 5), f=0.0012, b=0.0012, m=self.HAIR,
                       ref=tuple(H.to_3x3() @ V((0, -1, 0)))) for i, p in enumerate(pts)]
            loft(bg, rs, even(4, 0.785), ref=H.to_3x3() @ V((0, -1, 0)))
            self.add(bg, keep=True)
            # ear
            eg = Geo("ear")
            ear = [(-0.044, 0.007, 0.003, 0.006), (-0.036, 0.011, 0.004, 0.008), (-0.02, 0.013, 0.004, 0.009),
                   (0.0, 0.0135, 0.0045, 0.008), (0.012, 0.012, 0.004, 0.006), (0.018, 0.006, 0.003, 0.003)]
            rs = [dict(c=V((s * 0.071, 0.006 - (z + 0.02) * 0.18, z - 0.010)), w=w, f=f, b=b, m=self.SKIN,
                       nf=2, nb=2, ref=(s, 0, 0)) for z, w, f, b in ear]
            rs[0]["cap"] = 0.003
            rs[-1]["cap"] = 0.002
            loft(eg, rs, even(7), ref=V((s, 0, 0)))
            # the ear stands out at its back edge
            for i in range(len(eg.v)):
                p = eg.v[i]
                if p.y > 0.004:
                    eg.v[i] = V((p.x + s * (p.y - 0.004) * 0.6, p.y, p.z))
            eg.transform(H)
            self.add(eg, keep=True)
        # lips: an upper and a lower lip shaped across the mouth on the face
        for upper in (True, False):
            lg = Geo("lip")
            pts, rs = [], []
            n = 9
            lw = 0.0215 if not man else 0.023
            for i in range(n):
                t = -1 + 2 * i / (n - 1)
                x = t * lw
                if upper:
                    z = -0.0535 + 0.0012 * (1 - abs(t)) ** 2 - 0.0035 * abs(t) ** 2.2
                    h = 0.0034 * (1 - abs(t) ** 2.4) + 0.0006
                    if abs(t) < 0.18:
                        h -= 0.0006  # the cupid's bow
                else:
                    z = -0.0602 + 0.0026 * abs(t) ** 2.2
                    h = (0.0046 if not man else 0.0048) * (1 - abs(t) ** 2.0) + 0.0006
                p, _ = surf(x, z)
                pl = H.inverted() @ p
                depth = h * 0.75
                rs.append(dict(c=V((pl.x, pl.y + depth * 0.25, pl.z)), w=h, f=depth, b=depth * 0.6,
                               m=self.LIP, t=(1, 0, 0), ref=(0, -1, 0)))
            rs[0]["cap"] = 0.0
            rs[-1]["cap"] = 0.0
            # w is across the path (here vertical), f/b toward and away from the viewer
            loft(lg, rs, even(6, 0.0), ref=V((0, -1, 0)))
            lg.transform(H)
            self.add(lg, keep=True)
        return head

    # ---- hair ------------------------------------------------------------------------------
    def hair(self):
        st = self.L["hair"]
        H = self.head_M
        Hi = H.inverted()
        bvh = self.head_bvh
        R = H.to_3x3()
        cols = 24 if st != "short" else 20
        part = self.L.get("part", 0.0)

        def surf_dir(d_local):
            o = H @ (d_local * 0.4)
            hit = bvh.ray_cast(o, (R @ -d_local).normalized())
            return Hi @ hit[0] if hit[0] is not None else d_local * 0.1

        # hairline polar angle (from the crown, local) by |azimuth| (0 front .. pi back)
        if st == "short":
            hl = [(0, 0.74), (0.45, 0.80), (0.85, 1.05), (1.15, 1.36), (1.45, 1.42), (1.75, 1.55), (2.4, 1.95), (3.15, 2.08)]
        else:
            hl = [(0, 0.80), (0.6, 0.94), (1.1, 1.36), (1.45, 1.52), (1.75, 1.62), (2.4, 1.98), (3.15, 2.12)]

        def hairline(az):
            a = abs(((az + math.pi) % TAU) - math.pi)
            for (a0, p0), (a1, p1) in zip(hl, hl[1:]):
                if a0 <= a <= a1:
                    return lerp(p0, p1, (a - a0) / (a1 - a0))
            return hl[-1][1]

        # where the hanging part ends (z, in the 1.70 frame) and how full it is
        hang = {"long": (1.16, 0.010), "bob": (HEAD_C.z - 0.085, 0.016), "shoulder": (1.40, 0.014),
                "wavy": (1.385, 0.026), "short": (None, 0.0)}[st]
        vol = {"long": 0.007, "bob": 0.012, "shoulder": 0.010, "wavy": 0.022, "short": 0.006}[st]
        tab = self.torso_table()

        def body_clear(p, front):
            """Push a hanging hair point out of the torso along y (front or back)."""
            if p.z > 1.47:
                return p
            r = interp(tab, p.z, ("w", "f", "b", "oy"))
            cx = self.shift * smooth01((1.30 - p.z) / 0.4)
            dx = (p.x - cx) / (r["w"] + 0.028)
            if abs(dx) >= 1:
                return p
            depth = (r["f"] if front else r["b"]) + 0.02 + (0.03 * self.L["bust"] if front and 1.15 < p.z < 1.32 else 0)
            if 1.36 < p.z < 1.49:  # over a collar or a jacket's shoulders
                depth += 0.026 * smooth01((p.z - 1.36) / 0.04)
            need = depth * math.sqrt(max(0.0, 1 - dx ** 4)) ** 0.5
            y = r["oy"] + (-need if front else need)
            if front and p.y > y:
                return V((p.x, y, p.z))
            if not front and p.y < y:
                return V((p.x, y, p.z))
            return p

        rows_n = 8 if st == "short" else 12
        grid = []
        for j in range(cols + 1):
            az = part + TAU * j / cols
            a = abs(((az + math.pi) % TAU) - math.pi)
            phi_end = hairline(az)
            dirs = lambda phi: V((math.sin(phi) * math.sin(az), -math.sin(phi) * math.cos(az), math.cos(phi)))
            # the scalp part
            k1 = rows_n if hang[0] is None else 6
            hang_w = 0.0 if hang[0] is None else smooth01((a - 0.62) / 0.5)
            if hang[0] is not None and st in ("long",):
                hang_w = smooth01((a - 0.95) / 0.45)
            if hang[0] is not None and st == "bob":
                hang_w = smooth01((a - 0.55) / 0.35)
            pts = []
            for i in range(k1):
                t = i / (k1 - 1)
                phi = lerp(0.05, phi_end + hang_w * 0.25, t)
                d = dirs(phi)
                s = surf_dir(d)
                off = 0.0035 + vol * (1 - t) ** 0.6 + hang[1] * t * hang_w
                if hang_w < 0.01:  # a hairline lies flat on the skin instead of ending in a step
                    off = lerp(off, 0.0012, smooth01((t - 0.7) / 0.3))
                # the part: a slight groove
                da = abs(((az - part + math.pi) % TAU) - math.pi)
                if da < 0.2 and phi < 0.9:
                    off *= 0.55 + 0.45 * da / 0.2
                pts.append(H @ (s + d * off))
            if hang[0] is not None:
                last = pts[-1]
                front = a < math.pi / 2
                z_end = hang[0] + (0.035 * math.cos(a) if st in ("long", "shoulder", "wavy") else 0)
                if st == "bob":
                    z_end = hang[0] - 0.012 * math.cos(a) + 0.01 * (a / math.pi)
                z_end = lerp(last.z, z_end, hang_w)
                k2 = rows_n - k1
                outward = V((math.sin(az), -math.cos(az), 0)) if st != "bob" else V((math.sin(az), -math.cos(az) * 0.6, 0))
                for i in range(1, k2 + 1):
                    t = i / k2
                    p = V((last.x, last.y, lerp(last.z, z_end, t)))
                    p = p + outward * ((0.012 if st != "bob" else 0.004) * math.sin(t * math.pi * 0.9) * hang_w)
                    if st == "bob":
                        p = p - outward * 0.012 * smooth01((t - 0.5) / 0.5) * hang_w
                    if st == "wavy":
                        p = p + outward * 0.010 * math.sin(t * 7.0 + a * 2) * hang_w
                    if j % 2 and hang_w > 0.5 and i == k2 and st != "bob":
                        p.z += 0.012 if st != "bob" else 0.004  # uneven tips
                    pts.append(body_clear(p, front) if hang_w > 0 else p)
                # relax the strand a little after the clearing
                for _ in range(2):
                    for i in range(k1, len(pts) - 1):
                        pts[i] = pts[i].lerp((pts[i - 1] + pts[i + 1]) / 2, 0.35)
            grid.append(pts)
        g = Geo("hair")
        idx = [[g.vert(p) for p in col] for col in grid]
        crown = g.vert(H @ (surf_dir(V((0, 0, 1))) + V((0, 0, 0.0035 + vol))))
        nrow = len(grid[0])
        for j in range(cols):
            a = abs((((part + TAU * (j + 0.5) / cols) + math.pi) % TAU) - math.pi)
            m = self.HAIR
            if self.STREAK is not None and (0.55 < a < 0.82 or (j % 7 == 3 and a > 1.2)):
                m = self.STREAK
            g.face((crown, idx[j + 1][0], idx[j][0]), m)
            for i in range(nrow - 1):
                g.face((idx[j][i], idx[j + 1][i], idx[j + 1][i + 1], idx[j][i + 1]), m)
        o = self.add(g, recalc=False)
        self._fix_normals_radial(o, H @ V((0, 0.0, -0.02)))
        if st != "short":
            md = o.modifiers.new("s", "SOLIDIFY")
            md.thickness = 0.008
            md.offset = -1
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier="s")
        return o

    def _fix_normals_radial(self, o, centre):
        me = o.data
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.normal_update()
        score = sum(f.normal.dot(f.calc_center_median() - centre) for f in bm.faces)
        if score < 0:
            bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()

    # ---- the whole person --------------------------------------------------------------------

    # ---- village headwear and the apron --------------------------------------------------
    def _shell(self, g, m, flip_if_inward=None):
        """Makes an object from an open or closed surface; open ones are thickened a little."""
        o = g.obj(recalc=flip_if_inward is None)
        if flip_if_inward is not None:
            c = flip_if_inward
            s = sum((p.normal.dot(p.center - c)) for p in o.data.polygons)
            if s < 0:
                bm = bmesh.new(); bm.from_mesh(o.data)
                bmesh.ops.reverse_faces(bm, faces=bm.faces)
                bm.to_mesh(o.data); bm.free()
            md = o.modifiers.new("s", "SOLIDIFY")
            md.thickness = 0.007
            md.offset = -1
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier="s")
        self.objs.append(o)
        self.keep.append(o)   # thin shells tear when they are simplified
        return o

    def _revolve(self, name, prof, c, m, n=28, thick=0.006, sy=1.0):
        """A thin closed dome: `prof` is (radius, height) from the rim to the apex."""
        g = Geo(name)
        outer, inner = [], []
        for r, z in prof:
            outer.append([g.vert(V((c.x + math.cos(TAU * i / n) * r, c.y + math.sin(TAU * i / n) * r * sy, c.z + z)))
                          for i in range(n)])
            ri = max(r - thick, 0.0)
            inner.append([g.vert(V((c.x + math.cos(TAU * i / n) * ri, c.y + math.sin(TAU * i / n) * ri * sy,
                                    c.z + z - thick))) for i in range(n)])
        for k in range(len(prof) - 1):
            for i in range(n):
                j = (i + 1) % n
                g.face((outer[k][i], outer[k][j], outer[k + 1][j], outer[k + 1][i]), m)
                g.face((inner[k][j], inner[k][i], inner[k + 1][i], inner[k + 1][j]), m)
        for i in range(n):
            j = (i + 1) % n
            g.face((outer[0][j], outer[0][i], inner[0][i], inner[0][j]), m)
        return self._shell(g, m)

    def hat(self):
        kind, m = self.L.get("hat"), self.HATM
        if not kind:
            return
        c = V((HEAD_C.x, HEAD_C.y + 0.004, HEAD_C.z + 0.062))
        if kind == "non":        # the conical straw hat
            self._revolve("hat", [(0.345, 0.0), (0.315, 0.010), (0.255, 0.036), (0.185, 0.074), (0.115, 0.118),
                                  (0.05, 0.158), (0.0, 0.178)], c, m, n=30)
            band = mat("hatband", CL["scarfCoral"], 0.8)
            for s in (-1, 1):   # chin strap
                a = lib.Build(False).bar((s * 0.098, c.y - 0.02, c.z + 0.012), (s * 0.052, c.y - 0.075, HEAD_C.z - 0.105), 0.008, band)
                self.objs.append(a)
                self.keep.append(a)
        elif kind == "cap":      # a flat cap with a short peak
            self._revolve("cap", [(0.106, 0.0), (0.109, 0.018), (0.102, 0.046), (0.082, 0.072), (0.05, 0.09),
                                  (0.0, 0.098)], V((c.x, c.y + 0.004, c.z + 0.004)), m, n=22, sy=1.08)
            g = Geo("peak")
            top = [g.vert(V((c.x + 0.098 * math.cos(math.pi + math.pi * k / 10),
                             c.y - 0.075 + 0.105 * math.sin(math.pi + math.pi * k / 10), c.z + 0.004))) for k in range(11)]
            bot = [g.vert(V((p.x, p.y, p.z - 0.008))) for p in [g.v[i] for i in top]]
            for k in range(10):
                g.face((top[k], top[k + 1], bot[k + 1], bot[k]), m)
            g.face(tuple(top), m)
            g.face(tuple(reversed(bot)), m)
            pk = g.obj()
            self.objs.append(pk)
            self.keep.append(pk)
        else:                    # a knotted head scarf
            self._revolve("scarf", [(0.113, 0.0), (0.119, 0.030), (0.113, 0.066), (0.091, 0.097), (0.056, 0.117),
                                    (0.0, 0.127)], V((c.x, c.y + 0.006, c.z - 0.012)), m, n=26, sy=1.04)
            b = lib.Build(False)
            for s in (-1, 1):
                kb = b.ball(0.034, (s * 0.04, c.y + 0.115, c.z + 0.05), m, (1.5, 0.8, 0.9), seg=10, rings=6,
                            rot=(0, 0, s * 0.5))
                self.objs.append(kb)
                self.keep.append(kb)

    def apron(self):
        m = self.APRON
        if m is None:
            return
        g = Geo("apron")
        zs = [1.34, 1.29, 1.23, 1.16, 1.09, 1.02, 0.95, 0.88, 0.80, 0.72, 0.64]
        angs = [-1.2 + 2.4 * k / 12 for k in range(13)]
        rows = []
        for z in zs:
            zz = max(z, 0.795)
            r, c = self.torso_ring(zz)
            bib = 0.55 + 0.45 * smooth01((1.34 - z) / 0.16)
            flare = 1.03 + 0.30 * smooth01((1.02 - z) / 0.38)
            # stand clear of the bust and belly, which push the shirt out in front
            off = 0.018 + 0.030 * self.L["bust"] * smooth01((z - 1.02) / 0.1) * smooth01((1.38 - z) / 0.1) + 0.012 * (self.g - 1) * 4
            row = []
            for a in angs:
                x = c.x + r["w"] * math.sin(a) * bib * flare
                y = c.y + r["oy"] - (r["f"] + off) * math.cos(a) * flare
                row.append(g.vert(V((x, y, z))))
            rows.append(row)
        for k in range(len(zs) - 1):
            for i in range(len(angs) - 1):
                g.face((rows[k][i], rows[k][i + 1], rows[k + 1][i + 1], rows[k + 1][i]), m)
        self._shell(g, m, flip_if_inward=V((0, 0.2, 1.0)))
        b = lib.Build(False)
        for s in (-1, 1):   # shoulder straps from the bib's top corners
            st = b.bar((s * 0.062 * self.g, -0.066, 1.335), (s * 0.075, -0.014, 1.468), 0.02, m, depth=0.008)
            self.objs.append(st)
            self.keep.append(st)

    def build(self):
        o, neck_z = self.torso()
        if self.L["top"] == "shirt":
            self.collar_shirt(neck_z)
        if self.L["top"] == "jacket":
            self.jacket()
        for side in (-1, 1):
            self.leg(side)
        self.head()
        self.hair()
        self.hat()
        self.apron()
        hang = (7, -3, 3, 16, 1, 9)
        left = {"hang": (8, -2, 5, 18, 2, 10), "hip": (38, -18, -50, 12, -75, 25),
                "bent": (6, 4, 2, 48, 0, 40)}[self.L["left"]]
        self.arm(1, left)
        S = self.arm(-1, hang, wave=True)
        return S


# --------------------------------------------------------------------------------------------
# "Cute" proportions: a bigger head on a shorter, rounder body, applied to the finished mesh.
# --------------------------------------------------------------------------------------------
CUTE = dict(head=1.42, legs=0.86, round=1.07, neck=(1.38, 1.50))


def cute_warp(objs, extra_points=()):
    """Smoothly rescale everything: the body below the neck is shortened and made rounder, the head
    above it is enlarged (more at the top), with a blend across the neck so nothing tears."""
    H, K, R = CUTE["head"], CUTE["legs"], CUTE["round"]
    n0, n1 = CUTE["neck"]
    cy = HEAD_C.y

    def w(z):
        t = min(1.0, max(0.0, (z - n0) / (n1 - n0)))
        return t * t * (3 - 2 * t)

    # cumulative height map z -> z' (the vertical scale blends from K to H across the neck)
    steps = 2400
    zmax = 2.2
    table = [0.0]
    for i in range(steps):
        z = (i + 0.5) * zmax / steps
        table.append(table[-1] + (K + (H - K) * w(z)) * zmax / steps)

    def zmap(z):
        t = min(max(z, 0.0), zmax) / zmax * steps
        i = min(int(t), steps - 1)
        return table[i] + (table[i + 1] - table[i]) * (t - i)

    def warp(p):
        wz = w(p.z)
        sx = R + (H - R) * wz
        py = cy * wz
        return V((p.x * sx, py + (p.y - py) * sx, zmap(p.z)))

    for o in objs:
        for v in o.data.vertices:
            v.co = warp(v.co)
        o.data.update()
    return [warp(q) for q in extra_points]


def build(look):
    """Builds one look. Returns (body objects, face objects to protect, the arm_wave pivot, the
    arm's objects, height scale)."""
    p = Person(look)
    S = p.build()
    (S,) = cute_warp(p.objs + p.wave, [S])
    top = max(v.co.z for o in p.objs for v in o.data.vertices)
    bpy.ops.object.empty_add(location=S)
    pv = bpy.context.object
    pv.name = "arm_wave"
    # the tallest look is 1.78 m; everyone is a little shorter than life, which reads cuter
    return p.objs, p.keep, pv, p.wave, look["height"] * 0.94 / top
