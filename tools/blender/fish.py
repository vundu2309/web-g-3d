"""The sea animals of the fishing game (CONCEPT stage): sixteen cute, chunky, low-poly body plans.

Same family as the chibi cat vendors (vendors.py) and the round boat (boat.py): soft round bodies,
big friendly eyes with a glint, a small smile, bold simple fins, flat-shaded faces, no textures,
no rig. One body plan per `CreatureKind` of src/ocean/creatures.ts:

    slim round diamond puffer chunky torpedo flat sword shark flounder
    seahorse squid octopus crab lobster starfish

ROLE materials (recoloured per species at load, as boat-hull / boat-trim are per player):

    fish-body   the main skin                               (Species.body)
    fish-fin    fins, tail, claw tips, starfish dots         (Species.fin)
    fish-belly  the underside / blind side                   (Look.belly, else lighter(body, 0.62))
    fish-mark   stripes, bands, spots, gill slits, segments  (Look.mark,  else darker(body, 0.45))

Each role material is named `<role>.<species id>` and carries custom props `role` and `hex`.
Fixed colours are ordinary `c<hex>` materials from palette.json (eye white, pupil, glint, mouth,
cheek blush).

Parts, per animal `<kind>`: an empty `fish-<kind>` (the model origin = the code-built model's
origin), its child `<kind>-body` (body and fins, one mesh) and, where the animal has one, its
child `<kind>-tail` whose ORIGIN IS THE PIVOT (creature-kit.ts swings `tail` about the game's Y,
which is Blender Z). The hook point of creatures.ts is stored on the empty as `hook` (game
coordinates) and kept free of fins and eyes.

Axes: model units (about 1 long), Blender Z up. Game (x, y, z) = Blender (X, Z, -Y), as boat.py.
Fish: nose +X, side view from +-Y. The ray, crab, lobster and starfish are built lying (back up,
+Z) and then turned a quarter about X (creature-geometry.ts `standUp`), so their BACK faces
Blender +Y = the game's -Z viewer. The flounder is a side-lying fish whose eyed side faces
Blender +Y as well (NOTE: the code-built flounder has its eyes on game +Z; mirror Y if needed).

Like the other builders it never calls `lib.reset()`: it adds a NEW scene to the running Blender:

    import sys; sys.path.insert(0, "/path/to/tools/blender")
    import importlib, fish; importlib.reload(fish)
    fish.build_scene("Fish"); fish.render("/tmp/fish.png"); fish.render_sheet("/tmp/fish/")

Tunable numbers: EYE, MOUTH, FINS and PLANS (fish loft keys) at the top; the non-fish animals
have their own dicts (RAY, FLOUNDER, SEAHORSE, SQUID, OCTOPUS, CRAB, LOBSTER, STAR).
"""
import math, os
import bpy, bmesh
from mathutils import Matrix, Vector
import lib

PAL = lib.PAL
FACE = PAL["people"]["face"]


def lerp(a, b, t):
    return a + (b - a) * t


def mix_hex(a, b, t):
    ca = [(a >> 16) & 255, (a >> 8) & 255, a & 255]
    cb = [(b >> 16) & 255, (b >> 8) & 255, b & 255]
    c = [round(lerp(x, y, t)) for x, y in zip(ca, cb)]
    return (c[0] << 16) | (c[1] << 8) | c[2]


WHITE = PAL["paint"]["white"]
INK = FACE["lash"]


def lighter(h, t):
    return mix_hex(h, WHITE, t)


def darker(h, t):
    return mix_hex(h, INK, t)


# Fixed colours (palette roles only).
FIX = {
    "eye": FACE["white"],
    "pupil": INK,
    "glint": WHITE,
    "mouth": FACE["lipDeep"],
    "blush": mix_hex(PAL["paint"]["coral"], PAL["people"]["clothes"]["sneakerPink"], 0.5),
    "tooth": PAL["paint"]["cream"],
    "label": PAL["market"]["board"],
    "ground": mix_hex(PAL["paint"]["white"], PAL["fit"]["glass"], 0.18),
}

# The species table, copied from src/ocean/fishing.ts SPECIES (shape, body, fin, look).
SPECIES = {
    "ca-com": ("slim", 0x8FC4E8, 0x5B9CC9, {"belly": 0xF4FBFF}),
    "ca-bong": ("round", 0xB99A6B, 0x8B6F44, {}),
    "ca-chim": ("diamond", 0xC9D6E3, 0x8EA4BD, {"belly": 0xF1F4F7}),
    "ca-noc": ("puffer", 0xE6C35A, 0xC99A1C, {}),
    "ca-mu": ("chunky", 0xD98B5F, 0xA9582F, {}),
    "ca-thu": ("torpedo", 0x5AA7D6, 0x2F78A8, {"pattern": "wavy", "mark": 0x14304F, "belly": 0xE8F0F4}),
    "ca-hong": ("round", 0xE0584F, 0xB03A33, {"belly": 0xF6C9C0}),
    "ca-ngu": ("torpedo", 0x2F5FA8, 0x1D3F78, {"pattern": "plain", "belly": 0xDFE6EE}),
    "ca-duoi": ("flat", 0x8F7FB8, 0x64558F, {}),
    "ca-kiem": ("sword", 0x3B4F8C, 0x243063, {"belly": 0xC9D4E6}),
    "ca-nuc": ("slim", 0x7FB6C9, 0x4F8AA3, {"pattern": "lateral", "mark": 0xFFE08A, "belly": 0xF4F6F0}),
    "cua-bien": ("crab", 0xD9583F, 0xA63A28, {}),
    "sao-bien": ("starfish", 0xF08A4B, 0xC9632A, {}),
    "ca-he": ("round", 0xF2862E, 0xE0701C, {"pattern": "bands", "mark": 0xFFFFFF, "belly": 0xF2862E}),
    "ca-bon": ("flounder", 0xB59A74, 0x8C7552, {}),
    "ca-ngua": ("seahorse", 0xE8B64A, 0xC78D24, {}),
    "muc-ong": ("squid", 0xD9A3B8, 0xB57A94, {}),
    "bach-tuoc": ("octopus", 0xA86A8F, 0x7F466A, {}),
    "tom-hum": ("lobster", 0xC9442F, 0x8F2C1C, {}),
    "ca-map": ("shark", 0x7B8A99, 0x55626F, {"belly": 0xEEF1F4}),
}
# The species each body plan is shown in by default, and its default pattern (creatures.ts LOOKS).
DEFAULT = {
    "slim": "ca-com", "round": "ca-hong", "diamond": "ca-chim", "puffer": "ca-noc",
    "chunky": "ca-mu", "torpedo": "ca-thu", "flat": "ca-duoi", "sword": "ca-kiem",
    "shark": "ca-map", "flounder": "ca-bon", "seahorse": "ca-ngua", "squid": "muc-ong",
    "octopus": "bach-tuoc", "crab": "cua-bien", "lobster": "tom-hum", "starfish": "sao-bien",
}
PATTERN = {"slim": "lateral", "round": "mottled", "diamond": "plain", "puffer": "spots",
           "chunky": "spots", "torpedo": "bars", "sword": "plain", "shark": "plain",
           "flounder": "mottled", "flat": "spots"}
KINDS = ["slim", "round", "diamond", "puffer", "chunky", "torpedo", "flat", "sword", "shark",
         "flounder", "seahorse", "squid", "octopus", "crab", "lobster", "starfish"]
# The hook point of each code-built animal (creatures.ts, game coordinates), kept for the game code.
HOOK = {"flat": (0.36, 0, 0), "flounder": (0.46, 0, 0), "seahorse": (0.3, 0.41, 0),
        "squid": (0.2, 0, 0), "octopus": (0, 0.52, 0), "crab": (0.22, 0, -0.2),
        "lobster": (0.34, 0, -0.03), "starfish": (0, 0, -0.1)}

ROLE_BODY, ROLE_FIN, ROLE_BELLY, ROLE_MARK = "fish-body", "fish-fin", "fish-belly", "fish-mark"
BODY, FIN, BELLY, MARK = (("role", r) for r in (ROLE_BODY, ROLE_FIN, ROLE_BELLY, ROLE_MARK))


def colours(species_id):
    shape, body, fin, look = SPECIES[species_id]
    return {
        ROLE_BODY: body,
        ROLE_FIN: fin,
        ROLE_BELLY: look.get("belly", lighter(body, 0.62)),
        ROLE_MARK: look.get("mark", darker(body, 0.45)),
        "pattern": look.get("pattern", PATTERN.get(shape, "plain")),
    }


# ------------------------------------------------------------------------------------------------
# Tunable numbers
# ------------------------------------------------------------------------------------------------
EYE = {
    "white": 1.0,      # sclera radius (x the plan's eye size)
    "bulge": 0.62,     # sclera depth along the normal
    "pupil": 0.66,     # pupil radius
    "look": 0.22,      # pupil shift toward the nose
    "glint": 0.24,     # glint radius
    "sink": 0.28,      # how far the eye centre sits inside the skin
}
MOUTH = {"r": 0.0085, "sides": 4}
FINS = {"thick": 0.03, "taper": 0.45, "tail": 0.034}

# Fish lofts: s = 0 at the nose to 1 at the tail base; keys (s, half-width, top, bottom, centre z).
# eye (s, angle from the top in degrees, size); fins in the order dorsal, anal, pectoral, pelvic.
PLANS = {
    "slim": dict(
        nose=0.5, tail=-0.27, p=2.0, seg=12, st=11,
        keys=[(0, 0.045, 0.05, 0.045, 0), (0.08, 0.075, 0.095, 0.08, 0), (0.25, 0.085, 0.112, 0.095, 0),
              (0.5, 0.075, 0.1, 0.082, 0), (0.75, 0.05, 0.07, 0.055, 0), (1, 0.026, 0.035, 0.03, 0)],
        eye=(0.14, 62, 0.058), mouth=(0.9, 1.0),
        dorsal=dict(s=(0.36, 0.6), h=0.085, sweep=0.35), anal=dict(s=(0.62, 0.8), h=0.05, sweep=0.35),
        pectoral=dict(s=0.27, t=118, len=0.09, wid=0.045), pelvic=None,
        tailfin=dict(type="fork", L=0.19, S=0.15),
    ),
    "round": dict(
        nose=0.42, tail=-0.24, p=2.0, seg=16, st=12,
        keys=[(0, 0.06, 0.07, 0.06, -0.01), (0.08, 0.11, 0.16, 0.13, 0), (0.3, 0.13, 0.215, 0.17, 0.01),
              (0.55, 0.115, 0.19, 0.145, 0.01), (0.8, 0.075, 0.115, 0.09, 0), (1, 0.035, 0.05, 0.045, 0)],
        eye=(0.17, 58, 0.075), mouth=(0.9, 1.0),
        dorsal=dict(s=(0.22, 0.72), h=0.13, sweep=0.35), anal=dict(s=(0.55, 0.85), h=0.09, sweep=0.4),
        pectoral=dict(s=0.33, t=112, len=0.11, wid=0.06), pelvic=dict(s=0.32, len=0.08),
        tailfin=dict(type="round", L=0.18, S=0.16),
    ),
    "diamond": dict(
        nose=0.4, tail=-0.24, p=2.0, seg=16, st=12,
        keys=[(0, 0.04, 0.06, 0.05, 0), (0.1, 0.07, 0.17, 0.15, 0), (0.38, 0.085, 0.27, 0.24, 0),
              (0.62, 0.07, 0.2, 0.17, 0), (0.85, 0.04, 0.08, 0.07, 0), (1, 0.025, 0.04, 0.035, 0)],
        eye=(0.15, 60, 0.068), mouth=(0.75, 0.9),
        dorsal=dict(s=(0.42, 0.8), h=0.2, sweep=0.95, pointy=True),
        anal=dict(s=(0.45, 0.82), h=0.18, sweep=0.95, pointy=True),
        pectoral=dict(s=0.3, t=110, len=0.12, wid=0.05), pelvic=None,
        tailfin=dict(type="fork", L=0.2, S=0.2),
    ),
    "puffer": dict(
        nose=0.36, tail=-0.24, p=2.0, seg=16, st=12,
        keys=[(0, 0.08, 0.08, 0.07, 0), (0.1, 0.17, 0.18, 0.16, 0.0), (0.38, 0.235, 0.24, 0.22, 0.01),
              (0.68, 0.19, 0.2, 0.18, 0.01), (0.9, 0.09, 0.1, 0.09, 0), (1, 0.04, 0.045, 0.04, 0)],
        eye=(0.2, 52, 0.085), mouth=(0.6, 0.0),
        dorsal=dict(s=(0.68, 0.88), h=0.07, sweep=0.3), anal=dict(s=(0.7, 0.88), h=0.06, sweep=0.3),
        pectoral=dict(s=0.4, t=95, len=0.09, wid=0.07), pelvic=None,
        tailfin=dict(type="round", L=0.14, S=0.12),
        spikes=dict(n=34, len=0.045, r=0.016),
    ),
    "chunky": dict(
        nose=0.47, tail=-0.26, p=2.4, seg=16, st=12,
        keys=[(0, 0.08, 0.08, 0.06, -0.02), (0.08, 0.13, 0.15, 0.12, -0.01), (0.28, 0.15, 0.19, 0.15, 0.0),
              (0.55, 0.13, 0.17, 0.13, 0.0), (0.8, 0.085, 0.11, 0.085, 0), (1, 0.04, 0.055, 0.045, 0)],
        eye=(0.15, 50, 0.07), mouth=(1.25, 1.0),
        dorsal=dict(s=(0.2, 0.78), h=0.1, sweep=0.2, scallop=4), anal=dict(s=(0.6, 0.85), h=0.08, sweep=0.35),
        pectoral=dict(s=0.32, t=110, len=0.12, wid=0.07), pelvic=dict(s=0.3, len=0.08),
        tailfin=dict(type="round", L=0.17, S=0.15),
    ),
    "torpedo": dict(
        nose=0.5, tail=-0.28, p=2.0, seg=16, st=12,
        keys=[(0, 0.03, 0.035, 0.03, -0.005), (0.08, 0.08, 0.1, 0.085, 0), (0.3, 0.11, 0.14, 0.12, 0),
              (0.55, 0.1, 0.125, 0.105, 0), (0.82, 0.055, 0.065, 0.055, 0), (1, 0.022, 0.026, 0.024, 0)],
        eye=(0.13, 60, 0.062), mouth=(0.9, 1.0),
        dorsal=dict(s=(0.3, 0.5), h=0.1, sweep=0.55, pointy=True), anal=dict(s=(0.58, 0.72), h=0.06, sweep=0.5, pointy=True),
        pectoral=dict(s=0.26, t=105, len=0.11, wid=0.04), pelvic=None,
        tailfin=dict(type="lunate", L=0.18, S=0.2),
        finlets=dict(s=(0.76, 0.95), n=4, h=0.03),
    ),
    "sword": dict(
        nose=0.26, tail=-0.32, p=2.0, seg=16, st=12,
        keys=[(0, 0.04, 0.05, 0.045, -0.01), (0.1, 0.08, 0.11, 0.09, 0), (0.32, 0.1, 0.135, 0.11, 0),
              (0.6, 0.085, 0.11, 0.09, 0), (0.85, 0.045, 0.055, 0.047, 0), (1, 0.022, 0.026, 0.024, 0)],
        eye=(0.15, 60, 0.064), mouth=(0.8, 1.0),
        dorsal=dict(s=(0.16, 0.42), h=0.17, sweep=0.9, pointy=True), anal=dict(s=(0.66, 0.78), h=0.05, sweep=0.5, pointy=True),
        pectoral=dict(s=0.3, t=112, len=0.13, wid=0.035), pelvic=None,
        tailfin=dict(type="lunate", L=0.2, S=0.22),
        bill=dict(len=0.3, r=0.022),
    ),
    "shark": dict(
        nose=0.5, tail=-0.3, p=2.0, seg=16, st=12,
        keys=[(0, 0.05, 0.05, 0.04, 0.01), (0.07, 0.095, 0.1, 0.075, 0.0), (0.28, 0.125, 0.13, 0.11, 0),
              (0.55, 0.105, 0.11, 0.09, 0), (0.82, 0.05, 0.055, 0.045, 0.005), (1, 0.025, 0.028, 0.024, 0.01)],
        eye=(0.13, 62, 0.056), mouth=(1.1, 1.0),
        dorsal=dict(s=(0.3, 0.48), h=0.17, sweep=0.75, pointy=True), anal=dict(s=(0.72, 0.8), h=0.04, sweep=0.5, pointy=True),
        pectoral=dict(s=0.3, t=125, len=0.17, wid=0.07, down=40), pelvic=dict(s=0.6, len=0.06),
        tailfin=dict(type="shark", L=0.24, S=0.2),
        gills=dict(s=(0.2, 0.28), n=3),
    ),
}


# ------------------------------------------------------------------------------------------------
# Mesh helper (as boat.py: one material per palette colour, plus ROLE materials)
# ------------------------------------------------------------------------------------------------
def role_mat(role, hexint, tag):
    name = f"{role}.{tag}"
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    lin = lambda c: ((c / 255) ** 2.2)
    r, g, b = (hexint >> 16) & 255, (hexint >> 8) & 255, hexint & 255
    n = m.node_tree.nodes["Principled BSDF"]
    n.inputs["Base Color"].default_value = (lin(r), lin(g), lin(b), 1)
    n.inputs["Roughness"].default_value = 0.7
    m["hex"] = int(hexint)
    m["role"] = role
    return m


def colour_mat(hexint, rough=0.7):
    name = f"c{hexint:06x}"
    m = bpy.data.materials.get(name)
    if m is not None and int(m.get("hex", -1)) == int(hexint):
        return m
    lib.MATS.pop(name, None)
    return lib.mat(name, hexint, rough)


class Mesh:
    """A bmesh being built with one material per colour or role; flat faces unless `smooth`."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.keys = []

    def slot(self, col):
        key = col if isinstance(col, tuple) else int(col)
        if key not in self.keys:
            self.keys.append(key)
        return self.keys.index(key)

    def v(self, p):
        return self.bm.verts.new(Vector(p))

    def face(self, verts, col, smooth=False):
        vs = []
        for x in verts:
            if x not in vs:
                vs.append(x)
        if len(vs) < 3:
            return None
        try:
            f = self.bm.faces.new(vs)
        except ValueError:
            return None
        f.material_index = self.slot(col)
        f.smooth = smooth
        return f

    def tube(self, rings, col, cap0=None, cap1=None, smooth=False):
        """Loft rings of points; `col` is a colour, a list (one per band) or fn(band, j)."""
        vr = [[self.v(p) for p in ring] for ring in rings]
        pick = col if callable(col) else (lambda a, j: col[min(a, len(col) - 1)]) if isinstance(col, list) else (lambda a, j: col)
        for a in range(len(vr) - 1):
            n = len(vr[a])
            for j in range(n):
                k = (j + 1) % n
                self.face((vr[a][j], vr[a][k], vr[a + 1][k], vr[a + 1][j]), pick(a, j), smooth)
        if cap0 is not None:
            c = self.v(cap0)
            n = len(vr[0])
            for j in range(n):
                self.face((c, vr[0][(j + 1) % n], vr[0][j]), pick(-1, j), smooth)
        if cap1 is not None:
            c = self.v(cap1)
            n = len(vr[-1])
            for j in range(n):
                self.face((c, vr[-1][j], vr[-1][(j + 1) % n]), pick(len(vr) - 1, j), smooth)
        return vr

    def triangles(self):
        return sum(len(f.verts) - 2 for f in self.bm.faces)

    def transform(self, M):
        bmesh.ops.transform(self.bm, matrix=M, verts=self.bm.verts)

    def object(self, collection, cols, tag, origin=(0, 0, 0)):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        for e in self.bm.edges:
            e.smooth = all(f.smooth for f in e.link_faces) and len(set(f.material_index for f in e.link_faces)) == 1
        o_ = Vector(origin)
        for vv in self.bm.verts:
            vv.co -= o_
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for key in self.keys:
            if isinstance(key, tuple):
                me.materials.append(role_mat(key[1], cols[key[1]], tag))
            else:
                me.materials.append(colour_mat(key))
        o = bpy.data.objects.new(self.name, me)
        o.location = o_
        collection.objects.link(o)
        return o


# ------------------------------------------------------------------------------------------------
# Primitives
# ------------------------------------------------------------------------------------------------
def basis(n):
    """A rotation taking +Z to n."""
    return Vector((0, 0, 1)).rotation_difference(Vector(n).normalized()).to_matrix()


def ellipsoid(m, c, r, col, seg=8, rings=4, rot=None, smooth=False):
    c = Vector(c)
    R = rot or Matrix.Identity(3)
    rows = []
    for i in range(1, rings):
        phi = -math.pi / 2 + math.pi * i / rings
        rows.append([c + R @ Vector((r[0] * math.cos(phi) * math.cos(2 * math.pi * k / seg),
                                     r[1] * math.cos(phi) * math.sin(2 * math.pi * k / seg),
                                     r[2] * math.sin(phi))) for k in range(seg)])
    return m.tube(rows, col, cap0=c + R @ Vector((0, 0, -r[2])), cap1=c + R @ Vector((0, 0, r[2])), smooth=smooth)


def frame_along(t, ref=Vector((0, 1, 0))):
    t = Vector(t).normalized()
    if abs(t.dot(ref)) > 0.95:
        ref = Vector((0, 0, 1))
    a = ref - t * ref.dot(t)
    a.normalize()
    return a, t.cross(a)


def sweep(m, path, radii, col, sides=6, caps=True, ref=Vector((0, 1, 0)), smooth=False, phase=0.0):
    """A tube along `path`; radii per point is r or (r_ref, r_other)."""
    path = [Vector(p) for p in path]
    rings = []
    for i, p in enumerate(path):
        t = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)])
        a, b = frame_along(t, ref)
        r = radii[i]
        ra, rb = (r, r) if not isinstance(r, tuple) else r
        rings.append([p + a * (ra * math.cos(phase + 2 * math.pi * k / sides)) + b * (rb * math.sin(phase + 2 * math.pi * k / sides))
                      for k in range(sides)])
    return m.tube(rings, col, cap0=path[0] if caps else None, cap1=path[-1] if caps else None, smooth=smooth)


def fin(m, anchor, pts, normal, col, thick=None, taper=None):
    """A chunky fin: a fan from `anchor` over the outline `pts` (first and last at the base), thick
    at the base and thinner at the rim, closed all round."""
    th = (thick or FINS["thick"]) / 2
    tp = FINS["taper"] if taper is None else taper
    n = Vector(normal).normalized()
    A = Vector(anchor)
    loop = [Vector(p) for p in pts]
    f = [1.0] + [1.0 if i in (0, len(loop) - 1) else tp for i in range(len(loop))]
    allp = [A] + loop
    front = [m.v(p + n * th * k) for p, k in zip(allp, f)]
    back = [m.v(p - n * th * k) for p, k in zip(allp, f)]
    for i in range(1, len(allp) - 1):
        m.face((front[0], front[i], front[i + 1]), col)
        m.face((back[0], back[i + 1], back[i]), col)
    N = len(allp)
    for i in range(N):
        j = (i + 1) % N
        m.face((front[i], back[i], back[j], front[j]), col)


def d_outline(mid, U, V, half, h, sweep_=0.3, n=7, pointy=False, scallop=0):
    """A rounded 'D' (or swept, pointed) fin outline over a base of half-length `half` along U."""
    pts = []
    for k in range(n + 1):
        a = math.pi * k / n
        b = math.cos(a)
        hh = math.sin(a)
        if pointy:
            hh = math.sin(a) ** 0.8 * (1 - 0.55 * (a / math.pi))
            hh = max(hh, 0) if k not in (0, n) else 0
        if scallop and 0 < k < n:
            hh *= 0.85 + 0.15 * abs(math.cos(a * scallop))
        b = b - sweep_ * math.sin(a) * (1.4 if pointy else 1)
        pts.append(mid + U * (b * half) + V * (hh * h))
    return pts


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def catmull(keys, s, idx):
    """Catmull-Rom through keys (s, ...) at channel idx."""
    ks = keys
    for i in range(len(ks) - 1):
        if ks[i][0] <= s <= ks[i + 1][0]:
            break
    p0, p1, p2, p3 = ks[max(i - 1, 0)], ks[i], ks[i + 1], ks[min(i + 2, len(ks) - 1)]
    t = (s - p1[0]) / max(1e-6, p2[0] - p1[0])
    a, b, c, d = p0[idx], p1[idx], p2[idx], p3[idx]
    return 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t ** 3)


def hash01(i, j):
    h = (i * 374761393 + j * 668265263) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFFFFFF) / 4294967296


# ------------------------------------------------------------------------------------------------
# Loft body (s: 0 nose .. 1 tail base; t: angle from the top, + toward Blender +Y)
# ------------------------------------------------------------------------------------------------
class Loft:
    def __init__(self, nose, tail, keys, p=2.0, seg=16, st=12, axis="x"):
        self.nose, self.tail, self.keys, self.p, self.seg, self.st = nose, tail, keys, p, seg, st
        # stations denser at the nose (s grows like a gentle power curve)
        self.ss = [(i / (st - 1)) ** 1.15 for i in range(st)]

    def x(self, s):
        return lerp(self.nose, self.tail, s)

    def dims(self, s):
        return [max(1e-4, catmull(self.keys, s, k)) if k < 4 else catmull(self.keys, s, k) for k in (1, 2, 3, 4)]

    def point(self, s, t, grow=0.0):
        w, top, bot, zc = self.dims(s)
        st_, ct = math.sin(t), math.cos(t)
        e = 2.0 / self.p
        y = (w + grow) * math.copysign(abs(st_) ** e, st_)
        h = (top if ct >= 0 else bot) + grow
        z = zc + h * math.copysign(abs(ct) ** e, ct)
        return Vector((self.x(s), y, z))

    def normal(self, s, t):
        d = 1e-3
        a = self.point(s + d, t) - self.point(s - d, t)
        b = self.point(s, t + d) - self.point(s, t - d)
        n = b.cross(a)
        P = self.point(s, t)
        c = Vector((P.x, 0, self.dims(s)[3]))
        if n.dot(P - c) < 0:
            n = -n
        return n.normalized()

    def build(self, m, colour):
        """colour(s_mid, t_mid, i, j) -> material key."""
        seg = self.seg
        step = 2 * math.pi / seg
        ts = [step * k - step / 2 for k in range(seg)]  # faces centred on 0, step, ... (top, sides, bottom)
        rings = [[self.point(s, t) for t in ts] for s in self.ss]
        w0, top0, bot0, zc0 = self.dims(0)
        w1, top1, bot1, zc1 = self.dims(1)
        nose_cap = Vector((self.nose + min(w0, top0) * 0.55, 0, zc0))
        tail_cap = Vector((self.tail - min(w1, top1) * 0.4, 0, zc1))
        ssm = [(a + b) / 2 for a, b in zip(self.ss, self.ss[1:])]

        def pick(a, j):
            if a < 0:
                return colour(0.0, step * j, -1, j)
            if a >= len(ssm):
                return colour(1.0, step * j, len(ssm), j)
            return colour(ssm[a], step * j, a, j)
        return m.tube(rings, pick, cap0=nose_cap, cap1=tail_cap)


def skin(pattern, s, t, i, j, belly_band=-0.6):
    v = math.cos(t)
    if v < belly_band:
        return BELLY
    if pattern == "lateral" and abs(v) < 0.2 and 0.12 < s < 0.95:
        return MARK
    if pattern == "bands":
        for a, b in ((0.13, 0.25), (0.43, 0.56), (0.84, 1.0)):
            if a <= s <= b:
                return MARK
    if pattern == "saddle" and v > 0.4 and int(s * 4) % 2 == 1:
        return MARK
    return BODY


# ------------------------------------------------------------------------------------------------
# Face parts: eyes, smile, blush, spots
# ------------------------------------------------------------------------------------------------
def eye(m, P, n, e, fwd=Vector((1, 0, 0)), up=Vector((0, 0, 1)), look=None):
    n = Vector(n).normalized()
    R = basis(n)
    c = Vector(P) - n * (e * EYE["sink"])
    ellipsoid(m, c, (e * EYE["white"], e * EYE["white"], e * EYE["bulge"]), FIX["eye"], 10, 4, R, smooth=True)
    f = Vector(fwd) - n * Vector(fwd).dot(n)
    f = f.normalized() if f.length > 1e-6 else Vector((0, 0, 0))
    u = Vector(up) - n * Vector(up).dot(n)
    u = u.normalized() if u.length > 1e-6 else Vector((0, 0, 0))
    lk = EYE["look"] if look is None else look
    pc = c + f * (e * lk) + n * (e * EYE["bulge"] * 0.62)
    ellipsoid(m, pc, (e * EYE["pupil"], e * EYE["pupil"], e * 0.3), FIX["pupil"], 8, 3, R, smooth=True)
    gc = pc + n * (e * 0.24) + u * (e * 0.28) + f * (e * 0.2)
    ellipsoid(m, gc, (e * EYE["glint"],) * 3, FIX["glint"], 6, 2, R, smooth=True)
    gc2 = pc + n * (e * 0.2) - u * (e * 0.25) - f * (e * 0.12)
    ellipsoid(m, gc2, (e * EYE["glint"] * 0.45,) * 3, FIX["glint"], 4, 2, R, smooth=True)


def tube_path(m, pts, r, col, sides=None):
    sweep(m, pts, [r] * len(pts), col, sides or MOUTH["sides"], caps=True, smooth=True)


def blush(m, P, n, r):
    ellipsoid(m, Vector(P) + Vector(n) * 0.002, (r, r * 0.62, r * 0.18), FIX["blush"], 8, 2, basis(n))


def spot(m, P, n, r, col=MARK):
    ellipsoid(m, Vector(P), (r, r, r * 0.25), col, 7, 2, basis(n))


def loft_spots(m, L, n, s_range, t_range, r_range, seed, col=MARK, keep_clear=None):
    """n round spots scattered over a loft (a golden-ratio walk, so they do not clump)."""
    placed = []
    k = 0
    i = 0
    while k < n and i < n * 12:
        i += 1
        s = lerp(*s_range, (i * 0.618034 + hash01(seed, i) * 0.2) % 1)
        t = math.radians(lerp(*t_range, hash01(i, seed * 7 + 3)))
        r = lerp(*r_range, hash01(i * 3, seed))
        P = L.point(s, t)
        if any((P - q).length < (r + rr) * 1.25 for q, rr in placed):
            continue
        placed.append((P, r))
        spot(m, P, L.normal(s, t), r, col)
        k += 1


def stripe(m, L, s, wave, col, t_max=88, n=6):
    """A ribbon over the back from one flank to the other at s (wavy if `wave`)."""
    pts = []
    for k in range(n):
        t = math.radians(lerp(-t_max, t_max, k / (n - 1)))
        ss = s + wave * math.sin(t * 3.2)
        pts.append(L.point(ss, t) + L.normal(ss, t) * 0.002)
    sweep(m, pts, [(0.014, 0.006)] * n, col, 4, caps=True, ref=Vector((1, 0, 0)), phase=math.pi / 4)


# ------------------------------------------------------------------------------------------------
# The fish plans
# ------------------------------------------------------------------------------------------------
def tail_outline(kind, L, S):
    if kind == "fork":
        pts = [(0.03, 0.04), (-0.35 * L, 0.5 * S), (-0.75 * L, 0.92 * S), (-L, S), (-0.92 * L, 0.62 * S),
               (-0.6 * L, 0.14 * S), (-0.6 * L, -0.14 * S), (-0.92 * L, -0.62 * S), (-L, -S), (-0.75 * L, -0.92 * S),
               (-0.35 * L, -0.5 * S), (0.03, -0.04)]
    elif kind == "round":
        pts = [(0.03, 0.045)]
        for k in range(9):
            a = -1.15 + 2.3 * (8 - k) / 8
            pts.append((-L * (0.55 + 0.45 * math.cos(a * 0.9)), S * math.sin(a) / math.sin(1.15)))
        pts.append((0.03, -0.045))
    elif kind == "lunate":
        pts = [(0.03, 0.035), (-0.4 * L, 0.38 * S), (-0.8 * L, 0.8 * S), (-L, S), (-0.85 * L, 0.6 * S),
               (-0.62 * L, 0.24 * S), (-0.55 * L, 0.0), (-0.62 * L, -0.24 * S), (-0.85 * L, -0.6 * S), (-L, -S),
               (-0.8 * L, -0.8 * S), (-0.4 * L, -0.38 * S), (0.03, -0.035)]
    elif kind == "shark":
        pts = [(0.03, 0.04), (-0.4 * L, 0.45 * S), (-0.85 * L, 0.95 * S), (-L, 1.1 * S), (-0.9 * L, 0.75 * S),
               (-0.62 * L, 0.18 * S), (-0.5 * L, -0.05 * S), (-0.62 * L, -0.42 * S), (-0.52 * L, -0.55 * S),
               (-0.3 * L, -0.4 * S), (0.03, -0.04)]
    else:
        raise ValueError(kind)
    return pts


def build_fish(kind, cols):
    P = PLANS[kind]
    L = Loft(P["nose"], P["tail"], P["keys"], P["p"], P["seg"], P["st"])
    m = Mesh(f"{kind}-body")
    pattern = cols["pattern"]
    L.build(m, lambda s, t, i, j: skin(pattern, s, t, i, j))
    Y = Vector((0, 1, 0))

    def top_fin(spec, down=False):
        s0, s1 = spec["s"]
        t = math.pi if down else 0.0
        a, b = L.point(s0, t), L.point(s1, t)
        U = (a - b).normalized()
        V = Vector((-U.z, 0, U.x)) if not down else Vector((U.z, 0, -U.x))
        if V.z * (-1 if down else 1) < 0:
            V = -V
        mid = (a + b) / 2 - V * 0.012
        half = (a - b).length / 2
        pts = d_outline(mid, U, V, half, spec["h"], spec.get("sweep", 0.3), 8 if spec.get("pointy") else 7,
                        spec.get("pointy", False), spec.get("scallop", 0))
        fin(m, mid - V * 0.01, pts, Y, FIN_KEY)

    FIN_KEY = FIN_ROLE = ("role", ROLE_FIN)
    if P.get("dorsal"):
        top_fin(P["dorsal"])
    if P.get("anal"):
        top_fin(P["anal"], down=True)
    # pectoral fins: paddles from behind the gill, pointing back and down
    pc = P.get("pectoral")
    if pc:
        for side in (1, -1):
            t = math.radians(pc["t"]) * side
            B = L.point(pc["s"], t)
            n = L.normal(pc["s"], t)
            dn = math.radians(pc.get("down", 25))
            U = Vector((-math.cos(dn), side * 0.45, -math.sin(dn))).normalized()  # along the fin
            W = Vector((math.sin(dn), 0, -math.cos(dn)))                           # across the fin
            W = (W - U * W.dot(U)).normalized()
            pts = d_outline(B + U * 0.0, W, U, pc["wid"] / 2, pc["len"], 0.25, 6)
            fin(m, B - U * 0.01, pts, U.cross(W), FIN_KEY, thick=FINS["thick"] * 0.8)
    pv = P.get("pelvic")
    if pv:
        for side in (1, -1):
            t = math.radians(150) * side
            B = L.point(pv["s"], t)
            U = Vector((-0.55, side * 0.2, -1)).normalized()
            W = Vector((1, 0, -0.55)).normalized()
            pts = d_outline(B, W, U, 0.025, pv["len"], 0.6, 5, pointy=True)
            fin(m, B - U * 0.01, pts, U.cross(W), FIN_KEY, thick=FINS["thick"] * 0.7)
    # eyes, smile, blush
    es, et, e = P["eye"]
    for side in (1, -1):
        t = math.radians(et) * side
        eye(m, L.point(es, t), L.normal(es, t), e)
        bs = es + 0.075
        tb = math.radians(108) * side
        blush(m, L.point(bs, tb), L.normal(bs, tb), e * 0.55)
    smile(m, L, P["mouth"])
    extras(kind, m, L, P, cols)
    # tail (separate, origin at its pivot = where the body ends)
    w1, top1, bot1, zc1 = L.dims(1)
    pivot = Vector((P["tail"], 0, zc1))
    tm = Mesh(f"{kind}-tail")
    tf = P["tailfin"]
    pts = [pivot + Vector((x, 0, z)) for x, z in tail_outline(tf["type"], tf["L"], tf["S"])]
    fin(tm, pivot + Vector((0.01, 0, 0)), pts, Y, FIN_ROLE, thick=FINS["tail"])
    ellipsoid(tm, pivot + Vector((0.005, 0, 0)), (0.035, w1 * 1.05, max(top1, bot1) * 1.08), BODY, 8, 4)
    hook = (P["nose"] - 0.02, -0.005, 0)
    return m, tm, pivot, hook


def smile(m, L, mouth):
    """A little smile wrapping round the nose; mouth = (width, curl). The hook goes inside, behind it."""
    wd, curl = mouth
    r = MOUTH["r"]
    if curl <= 0.0:  # a round pout (the puffer)
        s = 0.012
        w, top, bot, zc = L.dims(s)
        c = Vector((L.nose + min(w, top) * 0.5, 0, zc - 0.25 * bot))
        R = basis(Vector((1, 0, -0.25)))
        ellipsoid(m, c, (0.026 * wd, 0.026 * wd, 0.016), FIX["mouth"], 8, 3, R, smooth=True)
        return
    pts = []
    for side in (-1, 1):
        seq = [(0.055 * wd, 98), (0.04 * wd, 113), (0.016, 135)] if side == -1 else [(0.016, 135), (0.04 * wd, 113), (0.055 * wd, 98)]
        for s, deg in seq:
            t = math.radians(deg) * side
            pts.append(L.point(s, t) + L.normal(s, t) * r * 0.4)
        if side == -1:
            w0, top0, bot0, zc0 = L.dims(0)
            cap = Vector((L.nose + min(w0, top0) * 0.55, 0, zc0))
            pts.append(L.point(0.0, math.radians(155)).lerp(cap, 0.45) + Vector((0.004, 0, 0)))
    # curl the ends up a touch
    pts[0] += Vector((0, 0, 0.012 * curl))
    pts[-1] += Vector((0, 0, 0.012 * curl))
    tube_path(m, pts, r, FIX["mouth"])


def extras(kind, m, L, P, cols):
    pattern = cols["pattern"]
    if pattern in ("spots", "mottled"):
        big = pattern == "mottled"
        n = {"puffer": 14, "chunky": 16}.get(kind, 10)
        loft_spots(m, L, n, (0.28, 0.92), (-112, 112), (0.022, 0.036) if big else (0.014, 0.022), 1 + len(kind))
    if pattern in ("bars", "wavy"):
        n = 6
        for k in range(n):
            s = lerp(0.3, 0.86, k / (n - 1))
            stripe(m, L, s, 0.03 if pattern == "wavy" else 0.0, MARK, 88 if pattern == "bars" else 70)
    sp = P.get("spikes")
    if sp:
        for i in range(sp["n"]):
            s = 0.18 + 0.68 * ((i * 0.618) % 1)
            t = (hash01(i, 21) * 2 - 1) * math.radians(170)
            if abs(t) > math.radians(60) and abs(t) < math.radians(85) and s < 0.4:
                continue  # keep the eye area clear
            B = L.point(s, t)
            n = L.normal(s, t)
            a, b = frame_along(n)
            base = [B + a * sp["r"] * math.cos(2 * math.pi * k / 4) + b * sp["r"] * math.sin(2 * math.pi * k / 4) - n * 0.004 for k in range(4)]
            tip = B + n * sp["len"] + Vector((-0.012, 0, 0))
            vs = [m.v(p) for p in base]
            vt = m.v(tip)
            for k in range(4):
                m.face((vs[k], vs[(k + 1) % 4], vt), FIN)
    fl = P.get("finlets")
    if fl:
        for k in range(fl["n"]):
            s = lerp(fl["s"][0], fl["s"][1], k / max(1, fl["n"] - 1))
            for down in (False, True):
                t = math.pi if down else 0.0
                B = L.point(s, t)
                V = Vector((0, 0, -1 if down else 1))
                pts = [B + Vector((0.02, 0, 0)), B + V * fl["h"] + Vector((-0.025, 0, 0)), B + Vector((-0.02, 0, 0))]
                fin(m, B - V * 0.01, pts, (0, 1, 0), FIN, thick=0.018)
    bill = P.get("bill")
    if bill:
        w, top, bot, zc = L.dims(0.0)
        base = Vector((L.nose + 0.01, 0, zc + top * 0.25))
        path = [base + Vector((bill["len"] * k / 4, 0, 0.006 * k)) for k in range(5)]
        radii = [(bill["r"] * (1 - 0.8 * k / 4), bill["r"] * 0.7 * (1 - 0.8 * k / 4)) for k in range(5)]
        sweep(m, path, radii, BODY, 6, caps=True)
    gl = P.get("gills")
    if gl:
        for side in (1, -1):
            for k in range(gl["n"]):
                s = lerp(gl["s"][0], gl["s"][1], k / max(1, gl["n"] - 1))
                pts = [L.point(s, math.radians(d) * side) + L.normal(s, math.radians(d) * side) * 0.004 for d in (62, 80, 98)]
                pts = [p + Vector((-0.008 * abs(i - 1), 0, 0)) for i, p in enumerate(pts)]
                tube_path(m, pts, 0.0055, MARK, 4)


# ------------------------------------------------------------------------------------------------
# Ray (flat): built lying, back up, then stood up
# ------------------------------------------------------------------------------------------------
RAY = {"nose": 0.4, "tail": -0.17, "span": 0.48, "thick": 0.075, "eye": 0.06, "whip": 0.42}


def build_ray(cols):
    R = RAY
    m = Mesh("flat-body")
    keys = [(0, 0.05, 0.03, 0.02, 0), (0.12, 0.2, 0.06, 0.035, 0), (0.35, R["span"] * 0.88, 0.08, 0.04, 0),
            (0.52, R["span"], R["thick"], 0.04, 0), (0.75, 0.3, 0.07, 0.035, 0), (1, 0.07, 0.05, 0.03, 0)]
    L = Loft(R["nose"], R["tail"], keys, 2.0, 16, 12)
    # wing tips get thin: the loft's ellipse already tapers toward +-Y
    L.build(m, lambda s, t, i, j: BELLY if math.cos(t) < -0.2 else BODY)
    loft_spots(m, L, 9, (0.35, 0.9), (-65, 65), (0.022, 0.032), 4)
    # eyes on top, a smile on the front rim, blush
    for side in (1, -1):
        s, t = 0.18, math.radians(28) * side
        eye(m, L.point(s, t), (L.normal(s, t) + Vector((0, 0, 0.6))).normalized(), R["eye"], fwd=Vector((1, 0, 0)), up=Vector((1, 0, 0.0)))
        blush(m, L.point(0.26, math.radians(48) * side), L.normal(0.26, math.radians(48) * side), 0.03)
    pts = [L.point(0.27 - 0.016 * abs(k) ** 1.5, math.radians(5.5 * k)) + Vector((0, 0, 0.003)) for k in (-2, -1, 0, 1, 2)]
    tube_path(m, pts, MOUTH["r"], FIX["mouth"])
    # little pelvic lobes by the tail base
    for side in (1, -1):
        B = L.point(0.93, math.radians(90) * side)
        pts = d_outline(B, Vector((1, 0, 0)), Vector((0, side, 0)), 0.05, 0.07, 0.5, 5)
        fin(m, B - Vector((0, side * 0.02, 0)), pts, (0, 0, 1), FIN)
    # whip tail (separate), pivot at the tail base, with a tiny dorsal fin
    pivot = Vector((R["tail"], 0, 0))
    tm = Mesh("flat-tail")
    path = [pivot + Vector((-R["whip"] * k / 6, 0, 0.01 * math.sin(k / 6 * 2.5))) for k in range(7)]
    sweep(tm, path, [(0.035 * (1 - 0.85 * k / 6), 0.025 * (1 - 0.8 * k / 6)) for k in range(7)], FIN, 6, ref=Vector((0, 0, 1)))
    B = path[1]
    fin(tm, B, [B + Vector((0.02, 0, 0.01)), B + Vector((-0.03, 0, 0.06)), B + Vector((-0.06, 0, 0.01))], (0, 1, 0), FIN, thick=0.015)
    return m, tm, pivot, (0.36, 0, 0)


# ------------------------------------------------------------------------------------------------
# Flounder: a side-lying flatfish; the eyed side faces Blender +Y
# ------------------------------------------------------------------------------------------------
FLOUNDER = {"nose": 0.46, "tail": -0.31, "h": 0.25, "w": 0.055, "eye": 0.06}


def build_flounder(cols):
    F = FLOUNDER
    m = Mesh("flounder-body")
    keys = [(0, 0.03, 0.06, 0.05, 0), (0.1, F["w"], 0.17, 0.13, 0.0), (0.35, F["w"], F["h"], F["h"] * 0.9, 0),
            (0.62, F["w"] * 0.9, F["h"] * 0.85, F["h"] * 0.8, 0), (0.85, 0.035, 0.12, 0.11, 0), (1, 0.02, 0.04, 0.04, 0)]
    L = Loft(F["nose"], F["tail"], keys, 2.0, 16, 12)
    pattern = cols["pattern"]

    def col(s, t, i, j):
        if math.sin(t) < -0.15:
            return BELLY  # the blind side
        return BODY
    L.build(m, col)
    if pattern in ("mottled", "spots"):
        loft_spots(m, L, 10, (0.3, 0.9), (25, 150), (0.02, 0.036), 5)
    # fringe fins all round (dorsal and anal), rounded
    for down in (False, True):
        t = math.pi if down else 0.0
        a, b = L.point(0.12 if not down else 0.3, t), L.point(0.92, t)
        U = (a - b).normalized()
        V = Vector((0, 0, -1 if down else 1))
        mid = (a + b) / 2 - V * 0.03
        pts = d_outline(mid, U, V, (a - b).length / 2, 0.075, 0.1, 9, scallop=5)
        fin(m, mid - V * 0.02, pts, (0, 1, 0), FIN)
    # both eyes on the +Y side, one above and behind the other
    Yn = Vector((0, 1, 0))
    for s, t in ((0.12, 40), (0.2, 62)):
        tt = math.radians(t)
        eye(m, L.point(s, tt), (L.normal(s, tt) + Yn).normalized(), F["eye"], up=Vector((0, 0, 1)))
    blush(m, L.point(0.2, math.radians(118)), L.normal(0.2, math.radians(118)), 0.03)
    pts = [L.point(0.02, math.radians(d)) + Vector((0.004, 0.004, 0)) for d in (112, 125, 140)]
    pts.insert(0, L.point(0.05, math.radians(104)) + Vector((0, 0.004, 0.008)))
    tube_path(m, pts, MOUTH["r"], FIX["mouth"])
    # a small pectoral on the eyed side
    B = L.point(0.3, math.radians(100))
    pts = d_outline(B, Vector((0, 0, 1)), Vector((-1, 0.2, -0.2)).normalized(), 0.025, 0.07, 0.3, 5)
    fin(m, B, pts, (0.1, 1, 0), FIN, thick=0.02)
    pivot = Vector((F["tail"], 0, 0))
    tm = Mesh("flounder-tail")
    pts = [pivot + Vector((x, 0, z)) for x, z in tail_outline("round", 0.16, 0.12)]
    fin(tm, pivot + Vector((0.01, 0, 0)), pts, (0, 1, 0), FIN, thick=FINS["tail"])
    ellipsoid(tm, pivot + Vector((0.005, 0, 0)), (0.035, 0.025, 0.045), BODY, 8, 4)
    return m, tm, pivot, (0.46, 0, 0)


# ------------------------------------------------------------------------------------------------
# Seahorse: upright, snout to +X; the curled tail is the swinging part
# ------------------------------------------------------------------------------------------------
SEAHORSE = {"head": (0.1, 0.37), "snout": (0.3, 0.41), "eye": 0.056, "belly": 0.115}


def build_seahorse(cols):
    S = SEAHORSE
    m = Mesh("seahorse-body")
    hx, hz = S["head"]
    # trunk along a bent spine: neck, belly bulge, hip
    spine = [(0.03, 0.31), (0.0, 0.22), (0.0, 0.12), (0.01, 0.02), (-0.01, -0.08), (-0.05, -0.16)]
    rad = [0.07, 0.095, S["belly"], S["belly"] * 1.02, 0.09, 0.06]
    path = [Vector((x, 0, z)) for x, z in spine]
    sides = 12

    def col(a, j):
        ang = 2 * math.pi * j / sides
        # j around the tube: frame a = +Y, b = t x Y; front (toward +X) faces are the belly
        if a < 0 or a >= len(path) - 1:
            return BODY
        return MARK if a % 2 == 1 and a < len(path) - 2 else BODY
    rings = []
    for i, p in enumerate(path):
        t = path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]
        A, B = frame_along(t)
        rings.append([p + A * (rad[i] * 0.85 * math.cos(2 * math.pi * k / sides)) + B * (rad[i] * math.sin(2 * math.pi * k / sides))
                      for k in range(sides)])
    # ribbed: an extra ring between each pair, slightly smaller
    dense = []
    drad = []
    for i in range(len(path) - 1):
        dense.append(rings[i])
        mid = [(a + b) / 2 for a, b in zip(rings[i], rings[i + 1])]
        c = (path[i] + path[i + 1]) / 2
        dense.append([c + (q - c) * 0.9 for q in mid])
    dense.append(rings[-1])

    def pick(a, j):
        q = dense[max(0, min(a, len(dense) - 1))][j]
        c = path[min(len(path) - 1, max(0, a // 2))]
        if (q - c).x > 0.04 and a >= 0:
            return BELLY
        return BODY
    m.tube(dense, pick, cap0=None, cap1=path[-1] + Vector((-0.01, 0, -0.03)))
    # head: a round skull leaning forward, snout, crown
    head_c = Vector((hx, 0, hz))
    ellipsoid(m, head_c, (0.11, 0.085, 0.09), BODY, 12, 6, Matrix.Rotation(math.radians(-15), 3, "Y"))
    sx, sz = S["snout"]
    snout = [head_c + Vector((0.06, 0, 0.0)), Vector((sx - 0.06, 0, sz - 0.01)), Vector((sx, 0, sz))]
    sweep(m, snout, [(0.04, 0.034), (0.03, 0.026), (0.032, 0.028)], BODY, 8, caps=True)
    # mouth: a tiny dark ring at the snout tip (the hook goes in there)
    ellipsoid(m, Vector((sx + 0.012, 0, sz)), (0.01, 0.022, 0.018), FIX["mouth"], 8, 3, basis(Vector((1, 0, 0))))
    # crown: three soft knobs
    for k, (dx, dz) in enumerate(((-0.02, 0.09), (-0.06, 0.075), (0.02, 0.085))):
        ellipsoid(m, head_c + Vector((dx, 0, dz)), (0.022, 0.018, 0.03), FIN, 6, 3)
    for side in (1, -1):
        P = head_c + Vector((0.025, side * 0.07, 0.012))
        eye(m, P, Vector((0.25, side, 0.15)).normalized(), S["eye"])
        blush(m, head_c + Vector((0.05, side * 0.072, -0.04)), Vector((0.3, side, -0.2)).normalized(), 0.025)
        tube_path(m, [head_c + Vector((0.11, side * 0.035, -0.035)), head_c + Vector((0.13, side * 0.03, -0.03))], 0.0055, FIX["mouth"])
    # dorsal fin on the back and a small pectoral behind the head
    B = Vector((-0.1, 0, 0.06))
    pts = d_outline(B, Vector((0, 0, 1)), Vector((-1, 0, 0)), 0.07, 0.07, 0.15, 7, scallop=3)
    fin(m, B + Vector((0.02, 0, 0)), pts, (0, 1, 0), FIN)
    for side in (1, -1):
        B = Vector((0.02, side * 0.075, 0.27))
        pts = d_outline(B, Vector((0, 0, 1)), Vector((-0.7, side * 0.5, 0)).normalized(), 0.025, 0.05, 0.2, 5)
        fin(m, B, pts, Vector((0.5, side * 0.7, 0)).normalized(), FIN, thick=0.016)
    # curled tail, separate, pivot at the hip
    pivot = path[-1]
    tm = Mesh("seahorse-tail")
    curl = [pivot]
    a0, r0 = math.pi, 0.11
    c = pivot + Vector((0.07, 0, -0.17))
    pts = [pivot + Vector((0.0, 0, -0.07)), pivot + Vector((0.0, 0, -0.14))]
    for k in range(9):
        a = math.pi * 0.95 - k * 0.55
        r = 0.085 * (1 - k * 0.075)
        pts.append(c + Vector((r * math.cos(a), 0, r * math.sin(a) * 0.95)))
    curl += pts
    radii = [0.058 * (1 - 0.82 * i / (len(curl) - 1)) + 0.008 for i in range(len(curl))]
    tring = []
    tsides = 8
    for i, p in enumerate(curl):
        t = curl[min(i + 1, len(curl) - 1)] - curl[max(i - 1, 0)]
        A, B2 = frame_along(t)
        tring.append([p + A * (radii[i] * 0.85 * math.cos(2 * math.pi * k / tsides)) + B2 * (radii[i] * math.sin(2 * math.pi * k / tsides)) for k in range(tsides)])
    tm.tube(tring, lambda a, j: MARK if a in (2, 5, 8) else BODY, cap0=None, cap1=curl[-1])
    return m, tm, pivot, (0.3, 0, 0.41)


# ------------------------------------------------------------------------------------------------
# Squid: horizontal, arms to +X; the arm bunch is the swinging part
# ------------------------------------------------------------------------------------------------
SQUID = {"tip": -0.5, "head": 0.13, "arms": 0.52, "r": 0.12, "eye": 0.06}


def build_squid(cols):
    Q = SQUID
    m = Mesh("squid-body")
    keys = [(0, 0.075, 0.075, 0.075, 0), (0.12, Q["r"], Q["r"], Q["r"], 0), (0.4, Q["r"] * 1.02, Q["r"] * 1.02, Q["r"] * 1.02, 0),
            (0.7, 0.095, 0.095, 0.095, 0), (0.9, 0.05, 0.05, 0.05, 0), (1, 0.02, 0.02, 0.02, 0)]
    L = Loft(0.06, Q["tip"], keys, 2.0, 14, 11)
    L.build(m, lambda s, t, i, j: BELLY if math.cos(t) < -0.6 else BODY)
    loft_spots(m, L, 10, (0.1, 0.6), (-120, 120), (0.012, 0.02), 7)
    # fins at the tail end: an arrowhead seen from the side (in the XZ plane)
    for down in (False, True):
        sg = -1 if down else 1
        a = L.point(0.62, 0 if not down else math.pi)
        tip = L.point(1.0, 0)
        pts = [a, Vector((Q["tip"] + 0.12, 0, sg * 0.15)), Vector((Q["tip"] - 0.02, 0, sg * 0.07)), Vector((Q["tip"] - 0.03, 0, 0))]
        fin(m, (a + pts[-1]) / 2, pts, (0, 1, 0), FIN, thick=0.03)
    # head with big eyes, smile
    hc = Vector((Q["head"], 0, 0))
    ellipsoid(m, hc, (0.09, 0.105, 0.095), BODY, 12, 6)
    for side in (1, -1):
        eye(m, hc + Vector((0.01, side * 0.085, 0.03)), Vector((0.1, side, 0.25)).normalized(), Q["eye"])
        blush(m, hc + Vector((0.05, side * 0.085, -0.035)), Vector((0.4, side, -0.2)).normalized(), 0.022)
    pts = [hc + Vector((0.075, side * 0.04, -0.05 + (0.006 if abs(side) == 1 else 0))) for side in (-1, -0.4, 0.4, 1)]
    pts = [hc + Vector((0.082, -0.045, -0.035)), hc + Vector((0.09, -0.02, -0.048)), hc + Vector((0.09, 0.02, -0.048)), hc + Vector((0.082, 0.045, -0.035))]
    tube_path(m, pts, MOUTH["r"], FIX["mouth"])
    # arms (separate): eight short ones and two long ones with clubs
    pivot = Vector((Q["head"] + 0.06, 0, 0))
    tm = Mesh("squid-tail")
    for k in range(8):
        a = 2 * math.pi * (k + 0.5) / 8
        dy, dz = math.cos(a), math.sin(a)
        path = [pivot + Vector((0.0, dy * 0.045, dz * 0.045))]
        for i in range(1, 4):
            u = i / 3
            path.append(pivot + Vector((0.22 * u, dy * (0.045 + 0.05 * u), dz * (0.045 + 0.06 * u) + 0.03 * u * u * (1 if dz > 0 else -1))))
        sweep(tm, path, [0.032 * (1 - 0.6 * i / 3) for i in range(4)], BODY if k % 2 else FIN, 5)
    for side in (1, -1):
        path = [pivot + Vector((0.0, side * 0.02, -0.01))]
        for i in range(1, 6):
            u = i / 5
            path.append(pivot + Vector((Q["arms"] * 0.62 * u, side * (0.02 + 0.06 * u), -0.01 - 0.05 * math.sin(u * 2.4))))
        sweep(tm, path, [0.018] * 5 + [0.016], FIN, 5, caps=False)
        ellipsoid(tm, path[-1] + Vector((0.025, 0, 0)), (0.04, 0.026, 0.026), FIN, 7, 4)
    return m, tm, pivot, (0.2, 0, 0)


# ------------------------------------------------------------------------------------------------
# Octopus: upright, mantle up, face to +X; the arm skirt is the swinging part
# ------------------------------------------------------------------------------------------------
OCTOPUS = {"mantle": (-0.03, 0.33), "mr": (0.19, 0.18, 0.23), "eye": 0.068, "arm": 0.36}


def build_octopus(cols):
    O = OCTOPUS
    m = Mesh("octopus-body")
    mx, mz = O["mantle"]
    rx, ry, rz = O["mr"]
    c = Vector((mx, 0, mz))
    rows = []
    seg, rings = 14, 8
    for i in range(1, rings):
        phi = -math.pi / 2 + math.pi * i / rings
        rows.append([c + Vector((rx * math.cos(phi) * math.cos(2 * math.pi * k / seg), ry * math.cos(phi) * math.sin(2 * math.pi * k / seg),
                                 rz * math.sin(phi) * (1.0 if phi > 0 else 0.8))) for k in range(seg)])
    m.tube(rows, BODY,
           cap0=c + Vector((0, 0, -rz * 0.8)), cap1=c + Vector((0, 0, rz)))
    for k, (az, el, r) in enumerate(((-0.6, 0.5, 0.03), (0.7, 0.3, 0.026), (2.2, 0.6, 0.032), (-2.0, 0.2, 0.028), (3.1, 0.75, 0.024), (1.6, 0.9, 0.02), (-1.2, 0.95, 0.022))):
        n = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
        P = c + Vector((n.x * rx, n.y * ry, n.z * rz))
        spot(m, P, Vector((n.x / rx, n.y / ry, n.z / rz)).normalized(), r)
    hc = Vector((0.03, 0, 0.13))
    ellipsoid(m, hc, (0.15, 0.15, 0.11), BODY, 12, 5)
    for side in (1, -1):
        P = hc + Vector((0.1, side * 0.085, 0.04))
        eye(m, P, Vector((0.75, side * 0.65, 0.1)).normalized(), O["eye"])
        blush(m, hc + Vector((0.135, side * 0.075, -0.03)), Vector((0.8, side * 0.5, -0.2)).normalized(), 0.024)
    pts = [hc + Vector((0.146, -0.04, -0.02)), hc + Vector((0.155, -0.015, -0.035)), hc + Vector((0.155, 0.015, -0.035)), hc + Vector((0.146, 0.04, -0.02))]
    tube_path(m, pts, MOUTH["r"], FIX["mouth"])
    # arms (separate), radiating and curling up at the tips, suckers in the belly colour
    pivot = Vector((0.03, 0, 0.05))
    tm = Mesh("octopus-tail")
    for k in range(8):
        a = 2 * math.pi * (k + 0.5) / 8
        d = Vector((math.cos(a), math.sin(a), 0))
        path = []
        n = 6
        for i in range(n):
            u = i / (n - 1)
            r = 0.06 + O["arm"] * u
            z = 0.02 - 0.12 * math.sin(u * 2.2) + 0.12 * u ** 3
            curl = 0.06 * u ** 2.5
            path.append(pivot + d * (r - curl * 0.5) + Vector((0, 0, z)))
        radii = [0.068 * (1 - 0.72 * i / (n - 1)) for i in range(n)]
        sweep(tm, path, radii, BODY, 6, ref=Vector((0, 0, 1)))
        for i in (2,):
            ell = path[i] + Vector((0, 0, -radii[i] * 0.85))
            ellipsoid(tm, ell, (radii[i] * 0.5,) * 2 + (radii[i] * 0.2,), BELLY, 6, 2)
    return m, tm, pivot, (0, 0, 0.52)


# ------------------------------------------------------------------------------------------------
# Crab: built lying (back +Z, claws +X), then stood up
# ------------------------------------------------------------------------------------------------
CRAB = {"shell": (0.2, 0.3, 0.1), "eye": 0.05, "claw": 0.1, "leg": 0.42}


def leg(m, root, knee, foot, r, col, tip=None):
    sweep(m, [root, knee, foot], [r, r * 0.95, r * 0.5], col, 5, phase=math.pi / 5)



def claw(m, base, side, size, arm_root):
    # arm, round palm, two fingers with fin-coloured tips
    palm = Vector(base)
    sweep(m, [arm_root, (arm_root + palm) / 2 + Vector((0, 0, 0.03)), palm], [0.035, 0.035, 0.04], BODY, 6)
    ellipsoid(m, palm, (size * 1.0, size * 0.75, size * 0.6), BODY, 8, 4, Matrix.Rotation(math.radians(25 * side), 3, "Z"))
    fwd = Matrix.Rotation(math.radians(25 * side), 3, "Z") @ Vector((1, 0, 0))
    out = Vector((0, side, 0))
    for k, (o, ln) in enumerate(((0.45, 1.0), (-0.45, 0.85))):
        root = palm + fwd * size * 0.75 + out * (o * size * 0.35)
        mid = root + fwd * size * 0.55 * ln + out * (-o * size * 0.1)
        tip = mid + fwd * size * 0.35 * ln + out * (-o * size * 0.32)
        sweep(m, [root, mid], [size * 0.3, size * 0.24], BODY, 5, ref=Vector((0, 0, 1)))
        sweep(m, [mid, tip], [size * 0.24, size * 0.05], FIN, 5, ref=Vector((0, 0, 1)))


def build_crab(cols):
    C_ = CRAB
    m = Mesh("crab-body")
    sx, sy, sz = C_["shell"]
    c = Vector((0, 0, 0.06))
    seg, rings = 16, 6
    rows = []
    for i in range(1, rings):
        phi = -math.pi / 2 + math.pi * i / rings
        rows.append([c + Vector((sx * math.cos(phi) * math.cos(2 * math.pi * k / seg) * (1.08 if math.cos(2 * math.pi * k / seg) > 0 else 1),
                                 sy * math.cos(phi) * math.sin(2 * math.pi * k / seg),
                                 sz * math.sin(phi) * (1 if phi > 0 else 0.55))) for k in range(seg)])
    m.tube(rows, lambda a, j: BELLY if a < 2 else BODY,
           cap0=c + Vector((0, 0, -sz * 0.55)), cap1=c + Vector((0, 0, sz)))
    # eyes on stalks at the front, looking up (toward the viewer once stood up)
    for side in (1, -1):
        root = c + Vector((sx * 0.75, side * 0.07, sz * 0.6))
        top = root + Vector((0.03, side * 0.015, 0.09))
        sweep(m, [root, top], [0.022, 0.018], BODY, 6)
        eye(m, top + Vector((0, 0, 0.02)), Vector((0.35, side * 0.2, 1)).normalized(), C_["eye"], fwd=Vector((0, 0, 0)), up=Vector((1, 0, 0)))
        blush(m, c + Vector((sx * 0.55, side * 0.15, sz * 0.8)), Vector((0.4, side * 0.3, 1)).normalized(), 0.03)
    pts = []
    for d in (-0.05, -0.025, 0.0, 0.025, 0.05):
        x = sx * 0.42 + 0.35 * d * d / 0.05
        pts.append(c + Vector((x, d, sz * math.sqrt(max(0.0, 1 - (x / sx) ** 2 - (d / sy) ** 2)) + 0.004)))
    tube_path(m, pts, MOUTH["r"], FIX["mouth"])
    # claws
    for side in (1, -1):
        claw(m, c + Vector((0.33, side * 0.3, 0.03)), side, C_["claw"], c + Vector((0.12, side * 0.22, 0.0)))
    # legs, four a side, spreading back and out
    for side in (1, -1):
        for k in range(3):
            a = math.radians(95 + k * 30)
            d = Vector((math.cos(a) * 0.7, side * math.sin(a), 0)).normalized()
            root = c + Vector((0.0 - k * 0.08, side * sy * 0.8, -0.01))
            knee = root + d * 0.13 + Vector((0, 0, 0.05))
            back = Matrix.Rotation(math.radians(40 * side), 3, "Z") @ d
            foot = knee + back * 0.11 + Vector((0, 0, -0.06))
            leg(m, root, knee, foot, 0.034, BODY)
    for i, (x, y, r) in enumerate(((-0.08, 0.1, 0.03), (-0.1, -0.12, 0.024), (0.02, 0.2, 0.02), (-0.02, -0.21, 0.026), (-0.15, 0.0, 0.02))):
        P = c + Vector((x, y, sz * math.sqrt(max(0.05, 1 - (x / sx) ** 2 - (y / sy) ** 2))))
        n = Vector((x / sx ** 2, y / sy ** 2, (P.z - c.z) / sz ** 2)).normalized()
        spot(m, P, n, r)
    return m, None, None, (0.22, 0, 0.2)


# ------------------------------------------------------------------------------------------------
# Lobster: lying, head +X; the abdomen with its fan is the swinging part (it flips toward the viewer)
# ------------------------------------------------------------------------------------------------
LOBSTER = {"head": 0.36, "joint": 0.03, "tip": -0.4, "r": 0.085, "eye": 0.045, "claw": 0.095}


def build_lobster(cols):
    Lb = LOBSTER
    m = Mesh("lobster-body")
    keys = [(0, 0.03, 0.03, 0.025, 0.02), (0.15, 0.065, 0.07, 0.05, 0.02), (0.5, Lb["r"], Lb["r"] * 1.05, 0.065, 0.03),
            (0.85, Lb["r"] * 0.95, Lb["r"], 0.06, 0.03), (1, 0.07, 0.075, 0.05, 0.03)]
    L = Loft(Lb["head"], Lb["joint"], keys, 2.2, 12, 8)
    L.build(m, lambda s, t, i, j: BELLY if math.cos(t) < -0.5 else BODY)
    for side in (1, -1):
        root = L.point(0.18, math.radians(25) * side)
        top = root + Vector((0.03, side * 0.03, 0.08))
        sweep(m, [root, top], [0.016, 0.014], BODY, 5)
        eye(m, top + Vector((0, 0, 0.015)), Vector((0.3, side * 0.25, 1)).normalized(), Lb["eye"], fwd=Vector((0, 0, 0)), up=Vector((1, 0, 0)))
        # antennae sweeping back
        a0 = L.point(0.05, math.radians(35) * side)
        ant = [a0 + Vector((0.03, side * 0.02, 0.02)), a0 + Vector((0.09, side * 0.12, 0.04)), a0 + Vector((0.05, side * 0.3, 0.05)), a0 + Vector((-0.12, side * 0.42, 0.04)), a0 + Vector((-0.3, side * 0.46, 0.03))]
        sweep(m, ant, [0.012, 0.01, 0.008, 0.006, 0.004], FIN, 4)
        claw(m, Vector((Lb["head"] + 0.14, side * 0.2, 0.03)), side, Lb["claw"], L.point(0.25, math.radians(90) * side))
        blush(m, L.point(0.3, math.radians(52) * side), L.normal(0.3, math.radians(52) * side), 0.022)
        for k in range(2):
            root = L.point(0.5 + k * 0.25, math.radians(115) * side)
            d = Vector((-0.3 - k * 0.25, side, 0)).normalized()
            knee = root + d * 0.09 + Vector((0, 0, 0.03))
            back = Matrix.Rotation(math.radians(45 * side), 3, "Z") @ d
            foot = knee + back * 0.08 + Vector((0, 0, -0.05))
            leg(m, root, knee, foot, 0.024, BODY)
    pts = [L.point(0.36 - 0.03 * abs(k) ** 1.4, math.radians(12 * k)) + Vector((0, 0, 0.003)) for k in (-2, -1, 0, 1, 2)]
    tube_path(m, pts, MOUTH["r"] * 0.9, FIX["mouth"])
    # abdomen: ribbed segments and a fan, separate, pivot at the joint
    pivot = Vector((Lb["joint"] + 0.01, 0, 0.03))
    tm = Mesh("lobster-tail")
    n = 5
    for k in range(n):
        x0 = pivot.x - 0.02 - k * (pivot.x - Lb["tip"]) / n
        w = Lb["r"] * (1 - 0.32 * k / n)
        sx = (pivot.x - Lb["tip"]) / n * 0.62
        ellipsoid(tm, Vector((x0 - sx * 0.6, 0, 0.03 - 0.008 * k)), (sx, w, w * 0.78), BODY if k % 2 == 0 else MARK, 8, 4)
    fx = Lb["tip"] - 0.02
    for k in range(3):
        a = math.radians(-45 + 45 * k)
        d = Vector((-math.cos(a), math.sin(a), 0))
        root = Vector((fx + 0.02, 0, 0.0))
        pts = d_outline(root + d * 0.0, Vector((-d.y, d.x, 0)), d, 0.042, 0.11 if k == 1 else 0.1, 0.0, 6)
        fin(tm, root, pts, (0, 0, 1), FIN, thick=0.02)
    return m, tm, pivot, (0.34, 0, 0.03)


# ------------------------------------------------------------------------------------------------
# Starfish: lying, five arms, a face in the middle
# ------------------------------------------------------------------------------------------------
STAR = {"arm": 0.5, "root": 0.12, "h": 0.085, "eye": 0.055}


def build_starfish(cols):
    S = STAR
    m = Mesh("starfish-body")
    for k in range(5):
        a = (k / 5) * math.pi * 2  # one arm to +X: up when it hangs, the face between the others
        d = Vector((math.cos(a), math.sin(a), 0))
        side = Vector((-d.y, d.x, 0))
        rings = []
        N, sides = 6, 8
        for i in range(N):
            u = i / (N - 1)
            r = 0.04 + S["arm"] * u * 0.86
            w = S["root"] * (1 - 0.72 * u)
            h = S["h"] * (1 - 0.55 * u)
            ring = []
            for j in range(sides):
                t = 2 * math.pi * j / sides
                z = h * math.sin(t) if math.sin(t) > 0 else h * 0.3 * math.sin(t)
                ring.append(d * r + side * (w * math.cos(t)) + Vector((0, 0, z)))
            rings.append(ring)

        def col(aa, j):
            t = 2 * math.pi * (j + 0.5) / sides
            return BELLY if math.sin(t) < 0 else BODY
        m.tube(rings, col, cap0=None, cap1=d * (0.04 + S["arm"] * 0.9) + Vector((0, 0, 0.01)))
        # dots along the top of the arm (Species.fin is the dot colour, as in creatures.ts)
        for i, u in enumerate((0.38, 0.58, 0.78)):
            r = 0.04 + S["arm"] * u * 0.86
            h = S["h"] * (1 - 0.55 * u)
            spot(m, d * r + Vector((0, 0, h * 0.98)), Vector((0, 0, 1)), 0.022 * (1 - 0.3 * u), FIN)
    ellipsoid(m, Vector((0, 0, 0.0)), (0.16, 0.16, S["h"] * 1.25), BODY, 14, 5)
    # face on the back, at the centre (the hook goes in under it)
    for side in (1, -1):
        eye(m, Vector((0.01, side * 0.055, S["h"] * 1.12)), Vector((0.15, side * 0.35, 1)).normalized(), S["eye"], fwd=Vector((0, 0, 0)), up=Vector((1, 0, 0)))
        blush(m, Vector((-0.06, side * 0.095, S["h"] * 0.95)), Vector((-0.3, side * 0.4, 1)).normalized(), 0.025)
    pts = [Vector((-0.05, d, S["h"] * 1.18 + (0.008 if abs(d) > 0.03 else 0))) for d in (-0.045, -0.018, 0.018, 0.045)]
    pts = [Vector((-0.06 + (0.012 if abs(p.y) > 0.03 else 0), p.y, S["h"] * 1.12)) for p in pts]
    tube_path(m, pts, MOUTH["r"], FIX["mouth"])
    return m, None, None, (0, 0, 0.1)


BUILDERS = {"flat": build_ray, "flounder": build_flounder, "seahorse": build_seahorse, "squid": build_squid,
            "octopus": build_octopus, "crab": build_crab, "lobster": build_lobster, "starfish": build_starfish}
LYING = {"flat", "crab", "lobster", "starfish"}
STAND = Matrix.Rotation(math.radians(-90), 4, "X")  # lying back (+Z) -> faces Blender +Y (game -Z)


def build_model(kind, species_id, collection, name=None):
    """One animal: an empty `fish-<kind>` (or `name`) with `<kind>-body` and maybe `<kind>-tail`."""
    cols = colours(species_id)
    if kind in PLANS:
        body, tail, pivot, hook = build_fish(kind, cols)
    else:
        body, tail, pivot, hook = BUILDERS[kind](cols)
    if kind in LYING:
        body.transform(STAND)
        if tail is not None:
            tail.transform(STAND)
            pivot = STAND @ Vector(pivot)
    tris = {"body": body.triangles(), "tail": tail.triangles() if tail else 0}
    root = bpy.data.objects.new(name or f"fish-{kind}", None)
    root.empty_display_size = 0.1
    collection.objects.link(root)
    bo = body.object(collection, cols, species_id)
    bo.parent = root
    if name:
        bo.name = f"{name}-body"
    if tail is not None:
        to = tail.object(collection, cols, species_id, origin=pivot)
        to.parent = root
        if name:
            to.name = f"{name}-tail"
    root["kind"] = kind
    root["species"] = species_id
    root["tris"] = tris["body"] + tris["tail"]
    gx, gy, gz = (HOOK.get(kind) or (hook[0], hook[2], -hook[1]))
    root["hook_game"] = (gx, gy, gz)
    return root, tris


# ------------------------------------------------------------------------------------------------
# Scene, layout, labels, render
# ------------------------------------------------------------------------------------------------
CELL = (1.45, 1.3)
COLS = 4


def _collection(scene, name):
    col = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if col.name not in [c.name for c in scene.collection.children]:
        scene.collection.children.link(col)
    return col


def _clear(scene):
    for o in list(scene.collection.all_objects):
        me = o.data if o.type in ("MESH", "FONT") and o.data.users == 1 else None
        is_mesh = o.type == "MESH"
        bpy.data.objects.remove(o, do_unlink=True)
        if me is not None:
            if is_mesh:
                bpy.data.meshes.remove(me)
            else:
                bpy.data.curves.remove(me)


def bbox(root):
    lo = Vector((1e9, 1e9, 1e9))
    hi = -lo
    # computed by hand: the Fish scene is usually not the window's scene, so matrix_world may be stale
    R = Matrix.LocRotScale(root.location, root.rotation_euler, root.scale)
    for ch in root.children:
        M = R @ ch.matrix_parent_inverse @ ch.matrix_basis
        for v in ch.data.vertices:
            w = M @ v.co
            lo = Vector((min(lo[i], w[i]) for i in range(3)))
            hi = Vector((max(hi[i], w[i]) for i in range(3)))
    return lo, hi


def place(root, centre):
    """Move `root` so its bounding box is centred on `centre` (X, Z), Y kept at 0."""
    root.location = (0, 0, 0)
    lo, hi = bbox(root)
    mid = (lo + hi) / 2
    root.location = (centre[0] - mid.x, 0, centre[1] - mid.z)


def label(collection, text, at, size=0.11):
    cu = bpy.data.curves.new(f"lbl-{text}", "FONT")
    cu.body = text
    cu.size = size
    cu.align_x = "CENTER"
    o = bpy.data.objects.new(f"lbl-{text}", cu)
    o.location = at
    o.rotation_euler = (math.radians(90), 0, math.radians(180))  # faces +Y, reads left to right from +Y
    cu.materials.append(colour_mat(FIX["label"]))
    collection.objects.link(o)
    return o


def copy_model(root, collection, name):
    r = root.copy()
    r.name = name
    r.hide_render = r.hide_viewport = False
    collection.objects.link(r)
    for ch in root.children:
        c = ch.copy()
        c.hide_render = c.hide_viewport = False
        c.parent = r
        c.matrix_parent_inverse = ch.matrix_parent_inverse.copy()
        collection.objects.link(c)
    return r


def cell_centre(i, cols=COLS, cell=CELL, rows=4):
    c, r = i % cols, i // cols
    return (-(c - (cols - 1) / 2) * cell[0], -(r - (rows - 1) / 2) * cell[1])


def build_scene(scene_name="Fish"):
    """A NEW scene: the sixteen animals in a 4 x 4 grid (in the default species of each body plan),
    labelled; the recolour variants in a hidden collection; light, a pale backdrop, a camera."""
    scene = bpy.data.scenes.get(scene_name) or bpy.data.scenes.new(scene_name)
    _clear(scene)
    grid = _collection(scene, "fish-grid")
    labels = _collection(scene, "fish-labels")
    shot = _collection(scene, "fish-shot")
    variants = _collection(scene, "fish-variants")
    tris = {}
    for i, kind in enumerate(KINDS):
        root, t = build_model(kind, DEFAULT[kind], grid)
        tris[kind] = t
        cx, cz = cell_centre(i)
        place(root, (cx, cz + 0.06))
        label(labels, kind, (cx, 0, cz - CELL[1] * 0.46))
    # recolour sets: one body plan in several species
    for kind, ids in RECOLOUR:
        for sid in ids:
            root, _ = build_model(kind, sid, variants, name=f"var-{kind}-{sid}")
            root.location = (0, 30, 0)
    world = bpy.data.worlds.get("fish-world") or bpy.data.worlds.new("fish-world")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.86, 0.9, 0.94, 1)
    bg.inputs["Strength"].default_value = 1.0
    scene.world = world
    for name, energy, colr, rot in (("fish-key", 3.0, (1.0, 0.96, 0.9), (-40, 0, 160)),
                                    ("fish-fill", 1.1, (0.85, 0.9, 1.0), (-60, 0, 230)),
                                    ("fish-rim", 1.2, (1.0, 1.0, 1.0), (55, 0, 20))):
        ld = bpy.data.lights.get(name) or bpy.data.lights.new(name, "SUN")
        ld.energy = energy
        ld.color = colr
        ld.angle = math.radians(10)
        lo = bpy.data.objects.new(name, ld)
        lo.rotation_euler = tuple(math.radians(a) for a in rot)
        scene.collection.objects.link(lo)
    cd = bpy.data.cameras.get("fish-cam") or bpy.data.cameras.new("fish-cam")
    cam = bpy.data.objects.new("fish-cam", cd)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = "BLENDER_EEVEE"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.film_transparent = False
    try:
        scene.eevee.taa_render_samples = 32
    except AttributeError:
        pass
    aim(scene, "overview")
    return tris


RECOLOUR = [("round", ("ca-bong", "ca-hong", "ca-he")), ("slim", ("ca-com", "ca-nuc")), ("torpedo", ("ca-thu", "ca-ngu"))]


def _show(scene, grid=True, labels=True, shot=False, variants=False):
    for name, on in (("fish-grid", grid), ("fish-labels", labels), ("fish-shot", shot), ("fish-variants", variants)):
        c = bpy.data.collections.get(name)
        if c is None:
            continue
        c.hide_render = not on
        for o in list(c.all_objects):
            o.hide_render = not on
            o.hide_viewport = not on


def _clear_shot():
    c = bpy.data.collections.get("fish-shot")
    for o in list(c.objects):
        me = o.data if o.type == "FONT" else None
        bpy.data.objects.remove(o, do_unlink=True)
        if me is not None and me.users == 0:
            bpy.data.curves.remove(me)


def _camera(scene, eye, target, ortho, res):
    cam = scene.camera
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = ortho
    cam.data.sensor_fit = "AUTO"
    cam.location = eye
    cam.rotation_euler = (Vector(target) - Vector(eye)).to_track_quat("-Z", "Y").to_euler()
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100


THREE_Q = (math.radians(-12), 0, math.radians(38))  # the model turned for a three-quarter view
HANG = (0, math.radians(-90), 0)  # +X up, as fishing-gear.ts hangs the animal from the rod tip


def aim(scene, shot, group=None):
    """overview (grid, labels) / phone (grid without labels, small) / close (a group of animals:
    side row and three-quarter row) / recolour (the variant sets)."""
    if shot in ("overview", "phone"):
        _show(scene, grid=True, labels=(shot == "overview"))
        w = COLS * CELL[0]
        if shot == "overview":
            _camera(scene, (0, 20, 0.0), (0, 0, 0.0), w * 1.02, (1600, 1450))
        else:
            _camera(scene, (0, 20, 0.0), (0, 0, 0.0), w * 1.02, (330, 300))
        return
    _clear_shot()
    sc = bpy.data.collections["fish-shot"]
    if shot == "close":
        _show(scene, grid=False, labels=False, shot=True)
        n = len(group)
        for i, kind in enumerate(group):
            src = bpy.data.objects[f"fish-{kind}"]
            cx = -(i - (n - 1) / 2) * CELL[0]
            a = copy_model(src, sc, f"shot-{kind}-side")
            a.rotation_euler = (0, 0, 0)
            place(a, (cx, 0.62))
            b = copy_model(src, sc, f"shot-{kind}-3q")
            b.rotation_euler = HANG if kind in LYING else THREE_Q
            place(b, (cx, -0.68))
            label(sc, kind, (cx, 0, -1.42), 0.1)
        wide = n * CELL[0] * 1.02
        _camera(scene, (0, 20, 0.0), (0, 0, -0.1), wide, (2400, int(2400 * 3.0 / wide)))
        return
    if shot == "recolour":
        _show(scene, grid=False, labels=False, shot=True, variants=True)
        rows = RECOLOUR
        for r, (kind, ids) in enumerate(rows):
            for i, sid in enumerate(ids):
                root = bpy.data.objects[f"var-{kind}-{sid}"]
                root.rotation_euler = (0, 0, 0)
                cx = -(i - 1) * CELL[0]
                cz = -(r - 1) * CELL[1] * 0.85
                place(root, (cx, cz + 0.08))
                label(sc, f"{kind}: {sid}", (cx, 0, cz - 0.42), 0.085)
        _camera(scene, (0, 20, 0.0), (0, 0, 0.0), 3 * CELL[0] * 1.05, (1500, 1300))
        return
    raise ValueError(shot)


def render(path, scene_name="Fish"):
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


GROUPS = [("slim", "round", "diamond", "puffer", "chunky", "torpedo"),
          ("flat", "sword", "shark", "flounder", "seahorse"),
          ("squid", "octopus", "crab", "lobster", "starfish")]


def render_sheet(out_dir, scene_name="Fish"):
    """overview (all sixteen, labelled), three close sheets (side and three-quarter rows), the
    recolour sheet and the phone-size sheet (each animal about 60 px)."""
    scene = bpy.data.scenes[scene_name]
    os.makedirs(out_dir, exist_ok=True)
    done = []
    aim(scene, "overview")
    done.append(render(os.path.join(out_dir, "fish-overview.png"), scene_name))
    for k, g in enumerate(GROUPS):
        aim(scene, "close", g)
        done.append(render(os.path.join(out_dir, f"fish-close-{'abc'[k]}.png"), scene_name))
    aim(scene, "recolour")
    done.append(render(os.path.join(out_dir, "fish-recolour.png"), scene_name))
    aim(scene, "phone")
    done.append(render(os.path.join(out_dir, "fish-phone.png"), scene_name))
    _clear_shot()
    aim(scene, "overview")
    return done


def triangle_report(scene_name="Fish"):
    out = {}
    for o in bpy.data.collections["fish-grid"].objects:
        if o.type == "EMPTY":
            out[o["kind"]] = int(o["tris"])
    return out


# ------------------------------------------------------------------------------------------------
# GLB export: one file per body plan, public/models/fish-<kind>.glb
# ------------------------------------------------------------------------------------------------
# The game recolours per species at load by replacing these exact role colours in COLOR_0 (sRGB bytes;
# the exporter writes them as normalised u16: 255 -> 65535, 1 -> 257, 0 -> 0). Fixed colours (eye white,
# pupil, glint, mouth, blush, tooth) keep their palette values.
SENTINEL = {ROLE_BODY: (255, 0, 1), ROLE_FIN: (0, 255, 1), ROLE_BELLY: (1, 0, 255), ROLE_MARK: (255, 255, 1)}


def bake_sentinel(o):
    """COLOR_0 per face: a role material becomes its SENTINEL colour, any other material its own hex."""
    me = o.data
    attr = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    for poly in me.polygons:
        m = o.material_slots[poly.material_index].material
        role = m.get("role") if m is not None else None
        if role in SENTINEL:
            r, g, b = SENTINEL[role]
        else:
            h = int(m["hex"])
            r, g, b = (h >> 16) & 255, (h >> 8) & 255, h & 255
        for li in poly.loop_indices:
            attr.data[li].color = (r / 255, g / 255, b / 255, 1.0)
    me.color_attributes.active_color = attr


def _write_glb(tmp, kind, body, tail, hook_game, path):
    """Copy body (and tail) into `tmp` under the node names body/tail, add the hook empty, export, and
    remove the copies. Returns {node: triangles}."""
    r2 = bpy.data.objects.new("fish", None)
    tmp.collection.objects.link(r2)
    tris = {}
    parts = [("body", body)] + ([("tail", tail)] if tail is not None else [])
    for new, o in parts:
        c = o.copy()
        c.data = o.data.copy()
        c.name = new
        c.data.name = f"{kind}-{new}"
        c.hide_viewport = c.hide_render = False
        tmp.collection.objects.link(c)
        c.parent = r2
        c.matrix_parent_inverse = Matrix.Identity(4)
        bake_sentinel(c)
        tris[new] = lib.triangles(c)
    gx, gy, gz = (float(v) for v in hook_game)
    h = bpy.data.objects.new("hook", None)
    h.empty_display_size = 0.03
    tmp.collection.objects.link(h)
    h.parent = r2
    h.matrix_parent_inverse = Matrix.Identity(4)
    h.location = (gx, -gz, gy)  # Blender coordinates of the game point (gx, gy, gz)
    tris["total"] = tris["body"] + tris.get("tail", 0)
    bpy.context.view_layer.update()
    for x in bpy.data.objects:
        x.select_set(False)
    for o in [r2] + list(r2.children):
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True,
        use_active_scene=True, export_vertex_color="ACTIVE", export_materials="EXPORT",
        export_cameras=False, export_lights=False, export_apply=True, export_yup=True)
    for o in list(r2.children) + [r2]:
        me = o.data if o.type == "MESH" else None
        bpy.data.objects.remove(o, do_unlink=True)
        if me is not None:
            bpy.data.meshes.remove(me)
    return tris


class _ExportScene:
    """A temporary scene that is the window's scene while exporting; parks objects named like the nodes."""

    def __enter__(self):
        self.win = bpy.context.window
        self.prev = self.win.scene if self.win else None
        self.tmp = bpy.data.scenes.new("fish-export")
        if self.win:
            self.win.scene = self.tmp
        self.clash = {}
        for n in ("fish", "body", "tail", "hook"):  # object names are global: park any holder
            if n in bpy.data.objects:
                self.clash[n] = bpy.data.objects[n]
                self.clash[n].name = f"{n}-parked"
        return self.tmp

    def __exit__(self, *exc):
        for n, o in self.clash.items():
            o.name = n
        if self.win and self.prev is not None:
            self.win.scene = self.prev
        bpy.data.scenes.remove(self.tmp)


def export_glb(out_dir, kinds=None, scene_name="Fish"):
    """Write <out_dir>/fish-<kind>.glb for each kind: root `fish`, children `body`, `tail` (where the
    animal has one; origin = pivot kept) and `hook` (an empty at hook_game, which equals glTF
    coordinates because Blender (X,Y,Z) -> glTF/game (X,Z,-Y)). Done from copies in a temporary scene;
    the Fish scene is untouched. Returns {kind: {node: triangles}}."""
    src = bpy.data.scenes[scene_name]
    os.makedirs(out_dir, exist_ok=True)
    done = {}
    with _ExportScene() as tmp:
        for kind in (kinds or KINDS):
            sroot = src.objects[f"fish-{kind}"]
            tail = src.objects.get(f"{kind}-tail")
            done[kind] = _write_glb(tmp, kind, src.objects[f"{kind}-body"], tail, sroot["hook_game"],
                                    os.path.join(out_dir, f"fish-{kind}.glb"))
    return done


def _signature(root):
    """Geometry + colour-role signature of a built model (positions of every polygon centre in the
    root's frame with its role or hex), to tell whether two species build the same animal."""
    sig = []
    for ch in sorted(root.children, key=lambda o: o.name.rsplit("-", 1)[-1]):
        M = ch.matrix_basis
        for p in ch.data.polygons:
            m = ch.material_slots[p.material_index].material
            key = m.get("role") or int(m["hex"])
            c = M @ p.center
            sig.append((ch.name.rsplit("-", 1)[-1], round(c.x, 4), round(c.y, 4), round(c.z, 4), key))
    return sorted(sig, key=str)


def export_species(out_dir):
    """For every species whose built geometry differs from its body plan's default species, write
    <out_dir>/fish-<species id>.glb (same nodes and sentinel colours). Builds each model in a temporary
    collection (removed afterwards). Returns {species id: {"kind", "file", "differs_by", "tris"}} for
    the ones with a file, and {"shared": [ids that use the plan file]}."""
    os.makedirs(out_dir, exist_ok=True)
    mats0 = set(bpy.data.materials.keys())
    meshes0 = set(bpy.data.meshes.keys())
    col = bpy.data.collections.new("fish-species-tmp")
    out = {"files": {}, "shared": []}
    built = {}
    try:
        with _ExportScene() as tmp:
            tmp.collection.children.link(col)
            for sid, (kind, body, fin, look) in SPECIES.items():
                root, _ = build_model(kind, sid, col, name=f"sp-{sid}")
                built[sid] = (kind, root)
            sigs = {sid: _signature(r) for sid, (k, r) in built.items()}
            for sid, (kind, root) in built.items():
                dflt = DEFAULT[kind]
                if sid == dflt:
                    continue
                if sigs[sid] == sigs[dflt]:
                    out["shared"].append(sid)
                    continue
                pat_s, pat_d = colours(sid)["pattern"], colours(dflt)["pattern"]
                diff = f"pattern {pat_s} (plan default {dflt}: {pat_d})"
                tail = next((c for c in root.children if c.name.endswith("-tail")), None)
                body = next(c for c in root.children if c.name.endswith("-body"))
                tris = _write_glb(tmp, kind, body, tail, root["hook_game"], os.path.join(out_dir, f"fish-{sid}.glb"))
                out["files"][sid] = {"kind": kind, "file": f"fish-{sid}.glb", "differs_by": diff, "tris": tris}
            out["defaults"] = [s for s in built if s == DEFAULT[built[s][0]]]
    finally:
        for o in list(col.all_objects):
            me = o.data if o.type == "MESH" else None
            bpy.data.objects.remove(o, do_unlink=True)
            if me is not None and me.users == 0:
                bpy.data.meshes.remove(me)
        bpy.data.collections.remove(col)
        for m in list(bpy.data.materials):
            if m.name not in mats0 and m.users == 0:
                bpy.data.materials.remove(m)
        for me in list(bpy.data.meshes):
            if me.name not in meshes0 and me.users == 0:
                bpy.data.meshes.remove(me)
    return out
