"""The player's fishing boat for the sea game (CONCEPT stage): a round, friendly wooden boat.

A chunky rounded hull with a sheer rising to a raked bow, a painted bottom, a cream boot stripe and
a chunky rubbing strip, a wooden gunwale cap and cream bulwarks inside; a small wheelhouse forward
of midship (front window, portholes, a door and a life ring on its back wall) under a domed roof;
a mast on the roof with a lantern and a pennant; a cute outboard on the transom; cleats, bow
lights, a rubber bow bumper, a rope coil, a rod holder where the game's rod sits (rod.ts ROD_BASE)
and a fish crate on an open stern deck that the chase camera looks down into. The rod itself is
left out (the game draws and animates it).

Built with bmesh only, one material per palette colour (`c<hex>`, so `lib.bake_colors` can bake
them) plus ROLE materials the game recolours per player (boatPalettes in src/ocean/palette.ts):

    boat-hull   the hull paint and the wheelhouse roof dome       (BoatPalette.hull)
    boat-trim   the rubbing strip, the roof's rim, the outboard's band and the pennant (BoatPalette.trim)

Parts, each its own mesh under the empty `boat` (origin = waterline at midship):

    boat-hull     hull shell, transom, gunwale cap, bulwarks, rubbing strip, bow bumper
    boat-deck     deck planks and fittings: cleats, bow lights, rod holder, fish crate, rope coil
    boat-canopy   wheelhouse, windows, door, life ring, roof, mast     (origin at its floor centre)
    boat-engine   outboard motor                       (origin at its pivot on the transom top)
    boat-flag     pennant                              (origin on the mast, where it is tied)
    boat-lantern  the mast-top lantern                 (origin at its base)

Axes: metres, Z up, the BOW points to Blender +Y (the exporter writes Y-up glTF, so +Y becomes the
model's -Z, the game's bow; as the hut's door in props.py). Game (x, y, z) = Blender (X, Z, -Y).

Like props.py and vendors.py it never calls `lib.reset()`: it adds a NEW scene to the running
Blender, driven through the Blender MCP:

    import sys; sys.path.insert(0, "/path/to/tools/blender")
    import importlib, boat; importlib.reload(boat)
    boat.build_scene("Boat"); boat.render("/tmp/boat.png")
    boat.render_sheet("/tmp/boat/")   # side, three-quarters, top, chase camera, phone size, palettes

Tunable numbers live in HULL, CABIN, ENGINE and FIT below.
"""
import math, os
import bpy, bmesh
from mathutils import Matrix, Vector
import lib

PAL = lib.PAL

# Per-player palettes, copied from src/ocean/palette.ts (boatPalettes); index 0 is the default.
BOAT_PALETTES = [
    {"hull": 0x2A6FB8, "trim": 0xFFD35A},
    {"hull": 0xE0654F, "trim": 0xFFF1C9},
    {"hull": 0x2F9A8A, "trim": 0xFFD35A},
    {"hull": 0x7A5BB5, "trim": 0xFFF1C9},
]
ROLE_HULL = "boat-hull"
ROLE_TRIM = "boat-trim"


def lerp(a, b, t):
    return a + (b - a) * t


def mix_hex(a, b, t):
    ca = [(a >> 16) & 255, (a >> 8) & 255, a & 255]
    cb = [(b >> 16) & 255, (b >> 8) & 255, b & 255]
    c = [round(lerp(x, y, t)) for x, y in zip(ca, cb)]
    return (c[0] << 16) | (c[1] << 8) | c[2]


# Role markers: a face painted with one of these gets the role material instead of a `c<hex>` one.
HULL_PAINT = ("role", ROLE_HULL)
TRIM_PAINT = ("role", ROLE_TRIM)

C = {
    "antifoul": PAL["hull"]["waterline"],
    "boot": PAL["hull"]["boot"],
    "cap": PAL["wood"]["trim"],
    "bulwark": PAL["paint"]["cream"],
    "deck": PAL["wood"]["deck"],
    "seam": PAL["wood"]["mid"],
    "wall": PAL["paint"]["creamWarm"],
    "frame": PAL["fit"]["frame"],
    "glass": PAL["fit"]["glass"],
    "door": PAL["fit"]["door"],
    "knob": PAL["fit"]["winch"],
    "ringRed": PAL["paint"]["red"],
    "ringWhite": PAL["paint"]["white"],
    "rope": PAL["fit"]["rope"],
    "rubber": PAL["fit"]["rubber"],
    "fender": PAL["fit"]["rope"],     # the bow's rope "pudding" fender
    "steel": PAL["metal"]["steel"],
    "chrome": PAL["metal"]["light"],
    "mast": PAL["wood"]["mid"],
    "lamp": PAL["light"]["lamp"],
    "cowl": PAL["paint"]["white"],
    "port": PAL["paint"]["red"],
    "starboard": PAL["paint"]["green"],
    "crate": PAL["paint"]["crate"],
    "crateLid": PAL["paint"]["crateLid"],
    "fishA": PAL["market"]["silver"],
    "fishB": PAL["paint"]["coral"],
    "fishEye": PAL["people"]["face"]["lash"],
    "water": mix_hex(PAL["fit"]["glass"], PAL["market"]["board"], 0.42),
    "floor": PAL["paint"]["white"],
}

# ------------------------------------------------------------------------------------------------
# Tunable numbers
# ------------------------------------------------------------------------------------------------
HULL = {
    "length": 7.4,        # keep: the physics box is 7.4 m long (boat-physics.ts HULL)
    "halfBeam": 1.40,     # with the flare and the rubbing strip the boat is about 3.0 m wide
    "sternBeam": 0.86,    # stern half beam as a share of halfBeam (a round, full stern)
    "bowStart": 0.45,     # where the plan starts to round in toward the bow (0 stern .. 1 bow)
    "bowPower": 2.4,      # higher = fuller, rounder bow in plan
    "flare": 0.06,        # extra beam at the gunwale toward the bow
    "sheerMid": 1.05,     # gunwale height at midship (above the waterline)
    "sheerRise": 0.62,    # extra height at the bow (gunwale about 1.67 there)
    "sheerPow": 2.3,
    "sternKick": 0.06,    # small rise of the gunwale at the stern
    "keel": -0.62,        # bottom at the stern / midship
    "keelRise": 0.40,     # the forefoot rises this much at the bow
    "rake": 0.38,         # the stem leans forward this much at the gunwale
    "deck": 0.78,         # deck height (game DECK_Y)
    "foredeckRise": 0.30, # the deck steps up toward the bow
    "boot": (-0.06, 0.20),  # painted boot stripe between these heights (game hull colours)
    "rub": (0.34, 0.12, 0.07),  # rubbing strip: from top-0.34 to top-0.12, standing out 0.07
    "cap": (0.07, 0.04),  # gunwale cap: height above the sheer, overhang outside
    "wall": 0.12,         # bulwark thickness
    "stations": 22,       # lengthwise rings (denser toward the bow)
    "transom": 0.12,      # transom thickness
}
CABIN = {
    "y": (0.30, 1.75),    # wheelhouse from / to (Blender Y, bow is +Y)
    "halfWidth": 0.80,
    "corner": 0.26,
    "height": 1.12,       # walls above the deck
    "taper": 0.93,        # top of the walls as a share of the bottom
    "roofOver": 0.20,     # roof overhang
    "roofRim": 0.13,      # roof rim thickness
    "roofDome": 0.16,     # extra height of the dome
    "mast": 1.25,         # mast height above the roof
}
ENGINE = {
    "back": 0.40,         # cowling centre behind the transom
    # cowling rings (height above cowlZ, half width, half length): a rounded box (superellipse)
    "cowl": [(0.00, 0.17, 0.22), (0.06, 0.21, 0.28), (0.20, 0.23, 0.31), (0.46, 0.22, 0.30), (0.58, 0.15, 0.21)],
    "cowlZ": 1.22,        # bottom of the cowling (just above the transom's cap)
    "legDown": -0.48,     # propeller hub height
}
FIT = {
    "rodBase": (1.25, -2.52, 1.35),  # game ROD_BASE (1.25, 1.35, 2.52) in Blender axes
    "rodLean": 0.95,                 # game ROD_LEAN (radians from vertical, toward +X)
    "crate": (-0.72, -2.55, 0.80, 0.56, 0.36),  # x, y, length, width, height
    "coil": (0.25, -3.05),
}


# ------------------------------------------------------------------------------------------------
# Mesh helper (as vendors.py, plus role materials)
# ------------------------------------------------------------------------------------------------
def role_mat(role, hexint):
    m = bpy.data.materials.get(role)
    if m is None:
        m = bpy.data.materials.new(role)
        m.use_nodes = True
    lin = lambda c: ((c / 255) ** 2.2)
    r, g, b = (hexint >> 16) & 255, (hexint >> 8) & 255, hexint & 255
    n = m.node_tree.nodes["Principled BSDF"]
    n.inputs["Base Color"].default_value = (lin(r), lin(g), lin(b), 1)
    n.inputs["Roughness"].default_value = 0.6
    m["hex"] = int(hexint)
    m["role"] = role
    return m


def colour_mat(hexint):
    name = f"c{hexint:06x}"
    m = bpy.data.materials.get(name)
    if m is not None and int(m.get("hex", -1)) == int(hexint):
        return m
    lib.MATS.pop(name, None)
    return lib.mat(name, hexint, 0.8)


class Mesh:
    """A bmesh being built with one material per colour (or role); `smooth` for new faces."""

    def __init__(self, name, smooth=False):
        self.name = name
        self.bm = bmesh.new()
        self.keys = []
        self.smooth = smooth

    def slot(self, col):
        key = col if isinstance(col, tuple) else int(col)
        if key not in self.keys:
            self.keys.append(key)
        return self.keys.index(key)

    def v(self, p):
        return self.bm.verts.new(Vector(p))

    def face(self, verts, col, smooth=None):
        vs = []
        for x in verts:  # drop repeated corners (a strip that ends in a point)
            if x not in vs:
                vs.append(x)
        if len(vs) < 3:
            return None
        try:
            f = self.bm.faces.new(vs)
        except ValueError:
            return None
        f.material_index = self.slot(col)
        f.smooth = self.smooth if smooth is None else smooth
        return f

    def tube(self, rings, col, cap0=None, cap1=None, loop=False, smooth=None):
        """Loft rings (each counter-clockwise about the travel direction, so normals face out)."""
        vr = [[self.v(p) for p in ring] for ring in rings]
        cols = col if isinstance(col, list) else [col] * len(vr)
        pairs = list(zip(range(len(vr)), range(1, len(vr))))
        if loop:
            pairs.append((len(vr) - 1, 0))
        for a, b in pairs:
            n = len(vr[a])
            for j in range(n):
                k = (j + 1) % n
                self.face((vr[a][j], vr[a][k], vr[b][k], vr[b][j]), cols[min(a, len(cols) - 1)], smooth)
        if cap0 is not None:
            c = self.v(cap0)
            n = len(vr[0])
            for j in range(n):
                self.face((c, vr[0][(j + 1) % n], vr[0][j]), cols[0], smooth)
        if cap1 is not None:
            c = self.v(cap1)
            n = len(vr[-1])
            for j in range(n):
                self.face((c, vr[-1][j], vr[-1][(j + 1) % n]), cols[-1], smooth)
        return vr

    def triangles(self):
        return sum(len(f.verts) - 2 for f in self.bm.faces)

    def object(self, collection, origin=(0, 0, 0), palette=0):
        # sharp edges where flat and smooth faces meet, so the round hull keeps crisp bands
        for e in self.bm.edges:
            fs = e.link_faces
            if len(fs) == 2 and (fs[0].smooth != fs[1].smooth or fs[0].material_index != fs[1].material_index and not (fs[0].smooth and fs[1].smooth)):
                e.smooth = False
        o_ = Vector(origin)
        for vv in self.bm.verts:
            vv.co -= o_
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        P = BOAT_PALETTES[palette]
        for key in self.keys:
            if isinstance(key, tuple):
                role = key[1]
                me.materials.append(role_mat(role, P["hull"] if role == ROLE_HULL else P["trim"]))
            else:
                me.materials.append(colour_mat(key))
        o = bpy.data.objects.new(self.name, me)
        o.location = o_
        collection.objects.link(o)
        return o


# ------------------------------------------------------------------------------------------------
# Primitives
# ------------------------------------------------------------------------------------------------
def frame(t):
    t = Vector(t).normalized()
    up =Vector((0, 0, 1)) if abs(t.z) < 0.95 else Vector((1, 0, 0))
    u = t.cross(up).normalized()
    return u, t.cross(u)


def ring(c, t, rx, ry=None, n=8, phase=0.0, u=None):
    """n points round centre c, about direction t (counter-clockwise seen from the tip of t)."""
    ry = rx if ry is None else ry
    a_, b_ = frame(t) if u is None else (u, t.normalized().cross(u))
    c = Vector(c)
    return [c + a_ * (rx * math.cos(phase + 2 * math.pi * k / n)) + b_ * (ry * math.sin(phase + 2 * math.pi * k / n)) for k in range(n)]


def cyl(m, p0, p1, r0, r1, col, n=8, caps=True, smooth=False, u=None):
    p0, p1 = Vector(p0), Vector(p1)
    t = p1 - p0
    rs = [ring(p0, t, r0, n=n, u=u), ring(p1, t, r1, n=n, u=u)]
    return m.tube(rs, col, cap0=p0 if caps else None, cap1=p1 if caps else None, smooth=smooth)


def box(m, c, size, col, rot=None):
    """An axis box (size = full x, y, z), optionally rotated by a Matrix (3x3) about its centre."""
    c = Vector(c)
    hx, hy, hz = (s / 2 for s in size)
    R = rot or Matrix.Identity(3)
    P = lambda x, y, z: c + R @ Vector((x, y, z))
    bot = [P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(-hx, hy, -hz)]
    m.tube([bot, [P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz)]], col,
           cap0=c + R @ Vector((0, 0, -hz)), cap1=c + R @ Vector((0, 0, hz)))


def quadbox(m, c, size, col, rot=None):
    """A box with 6 quad faces (12 triangles), for small fittings."""
    c = Vector(c)
    hx, hy, hz = (s / 2 for s in size)
    R = rot or Matrix.Identity(3)
    vs = [m.v(c + R @ Vector((sx * hx, sy * hy, sz * hz))) for sz in (-1, 1) for sy in (-1, 1) for sx in (-1, 1)]
    for a, b, cc, d in ((0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)):
        m.face((vs[a], vs[b], vs[cc], vs[d]), col)


def ellipsoid(m, c, r, col, seg=8, rings=5, smooth=True, colour_at=None):
    """An ellipsoid of radii r (x, y, z); colour_at(z_unit) may paint bands."""
    c = Vector(c)
    rows = []
    for i in range(1, rings):
        phi = -math.pi / 2 + math.pi * i / rings
        rows.append([c + Vector((r[0] * math.cos(phi) * math.cos(2 * math.pi * k / seg),
                                 r[1] * math.cos(phi) * math.sin(2 * math.pi * k / seg),
                                 r[2] * math.sin(phi))) for k in range(seg)])
    cols = [colour_at(math.sin(-math.pi / 2 + math.pi * (i + 0.5) / rings)) if colour_at else col for i in range(1, rings)]
    return m.tube(rows, cols, cap0=c + Vector((0, 0, -r[2])), cap1=c + Vector((0, 0, r[2])), smooth=smooth)


def torus(m, c, axis, R, r, cols, n1=16, n2=6, phase=0.0, smooth=False):
    """A torus about `axis`; cols is a colour or a function of the segment index."""
    c, axis = Vector(c), Vector(axis).normalized()
    a_, b_ = frame(axis)
    rows = []
    for i in range(n1):
        ang = 2 * math.pi * i / n1 + phase
        d = a_ * math.cos(ang) + b_ * math.sin(ang)
        ctr = c + d * R
        rows.append([ctr + d * (r * math.cos(2 * math.pi * k / n2)) + axis * (r * math.sin(2 * math.pi * k / n2)) for k in range(n2)])
    vr = [[m.v(p) for p in row] for row in rows]
    for i in range(n1):
        j = (i + 1) % n1
        col = cols(i) if callable(cols) else cols
        for k in range(n2):
            l = (k + 1) % n2
            m.face((vr[i][k], vr[j][k], vr[j][l], vr[i][l]), col, smooth)


def squircle(c, rx, ry, n=12, p=4.0):
    """A horizontal rounded-box ring (superellipse), counter-clockwise seen from above."""
    c = Vector(c)
    pts = []
    for k in range(n):
        a = 2 * math.pi * k / n + math.pi / n
        ca, sa = math.cos(a), math.sin(a)
        pts.append(c + Vector((rx * math.copysign(abs(ca) ** (2 / p), ca), ry * math.copysign(abs(sa) ** (2 / p), sa), 0)))
    return pts


def rounded_rect(hw, hl, rad, n=3, cy=0.0):
    """Plan outline (x, y) of a rounded rectangle, counter-clockwise from +X."""
    pts = []
    for qx, qy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        cx_, cy_ = qx * (hw - rad), cy + qy * (hl - rad)
        for k in range(n + 1):
            a = math.radians(a0 + 90 * k / n)
            pts.append((cx_ + rad * math.cos(a), cy_ + rad * math.sin(a)))
    return pts


# ------------------------------------------------------------------------------------------------
# The hull's lines
# ------------------------------------------------------------------------------------------------
def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def beam(u):
    H = HULL
    t = min(1.0, max(0.0, (u - H["bowStart"]) / (1 - H["bowStart"])))
    return H["halfBeam"] * (H["sternBeam"] + (1 - H["sternBeam"]) * smoothstep(0, 0.35, u)) * math.sqrt(max(0.0, 1 - t ** H["bowPower"]))


def top(u):
    H = HULL
    return H["sheerMid"] + H["sheerRise"] * u ** H["sheerPow"] + H["sternKick"] * (1 - u) ** 4


def bottom(u):
    return HULL["keel"] + HULL["keelRise"] * u ** 3


def deck_z(u):
    return HULL["deck"] + HULL["foredeckRise"] * smoothstep(0.80, 0.97, u)


def Y(u, z=None):
    """Lengthwise position; the bow rakes forward with height."""
    # the stern at -length/2 and the top of the raked stem at +length/2
    y = -HULL["length"] / 2 + (HULL["length"] - HULL["rake"]) * u
    if z is not None:
        h = max(0.0, (z - bottom(u)) / (top(u) - bottom(u)))
        y += HULL["rake"] * h ** 1.6 * smoothstep(0.55, 1.0, u)
    return y


def u_of(y):
    """Station parameter at lengthwise position y (ignoring the rake)."""
    return (y + HULL["length"] / 2) / (HULL["length"] - HULL["rake"])


def sec(u, s):
    """(x, z) on the starboard side for section parameter s (0 keel .. 1 gunwale)."""
    a = s * math.pi / 2
    x = beam(u) * math.sin(a) ** 0.8 * (1 + HULL["flare"] * s * u)
    z = bottom(u) + (top(u) - bottom(u)) * (1 - math.cos(a)) ** 0.85
    return x, z


def x_at(u, z):
    """Starboard half breadth of the outer skin at height z (bisection on s)."""
    lo, hi = 0.0, 1.0
    for _ in range(40):
        mid = (lo + hi) / 2
        if sec(u, mid)[1] < z:
            lo = mid
        else:
            hi = mid
    return sec(u, (lo + hi) / 2)[0]


def hull_rows(u):
    """Starboard profile of one station, from the keel up the outside, over the cap and down the
    bulwark to the deck: [(x, z, colour of the strip ABOVE this row, smooth)]."""
    H = HULL
    b0, b1 = H["boot"]
    tp, bt = top(u), bottom(u)
    k = min(1.0, beam(u) / 0.35)  # offsets shrink to nothing at the stem
    rl, ru, ro = H["rub"]
    ch, co = H["cap"]
    rows = []
    for f in (0.0, 0.33, 0.68):
        z = bt + (b0 - bt) * f
        rows.append((x_at(u, z) if f > 0 else 0.0, z, C["antifoul"], True))
    rows.append((x_at(u, b0), b0, C["boot"], True))
    rows.append((x_at(u, b1), b1, HULL_PAINT, True))
    zm = (b1 + tp - rl) / 2
    rows.append((x_at(u, zm), zm, HULL_PAINT, True))
    for dz, out, col in ((rl, 0.0, TRIM_PAINT), (rl - 0.05, 1.0, TRIM_PAINT), (ru + 0.04, 1.0, TRIM_PAINT), (ru, 0.0, HULL_PAINT)):
        z = tp - dz
        rows.append((x_at(u, z) + ro * out * k, z, col, col != TRIM_PAINT and True))
    xg = x_at(u, tp)
    rows.append((xg, tp, C["cap"], False))
    rows.append((xg + co * k, tp, C["cap"], False))            # cap overhang (under side)
    rows.append((xg + co * k, tp + ch, C["cap"], False))       # cap outer top
    xi = max(0.0, xg - H["wall"] * k)
    dz = deck_z(u)
    xi = max(0.0, min(xi, x_at(u, dz) - 0.05 * k))
    rows.append((xi, tp + ch, C["bulwark"], False))            # cap inner top
    for f in (0.3, 0.62):  # extra rows so the bulwark follows the raked stem
        rows.append((xi, lerp(tp + ch, dz, f), C["bulwark"], False))
    rows.append((xi, dz, None, False))                         # bulwark meets the deck
    return rows


def stations():
    n = HULL["stations"]
    return [1 - (1 - i / n) ** 1.3 for i in range(n + 1)]


def build_hull(col):
    m = Mesh("boat-hull", smooth=True)
    us = stations()
    grid = []  # per station: list of verts, port (reversed) + keel + starboard
    prof = []
    for u in us:
        rows = hull_rows(u)
        star = [Vector((x, Y(u, z), z)) for x, z, _, _ in rows]
        port = [Vector((-p.x, p.y, p.z)) for p in star]
        pts = list(reversed(port[1:])) + star  # keel (row 0) shared
        grid.append([m.v(p) for p in pts])
        prof.append(rows)
    nrow = len(prof[0])
    # strip colours along the profile: port strips (reversed) then starboard strips
    star_cols = [(r[2], r[3]) for r in prof[0][:-1]]
    cols = list(reversed(star_cols)) + star_cols
    for i in range(len(us) - 1):
        a, b = grid[i], grid[i + 1]
        for j in range(len(a) - 1):
            colr, sm = cols[j]
            m.face((a[j], b[j], b[j + 1], a[j + 1]), colr, sm)
    # transom: outer face at the stern station, then its top and its inner face
    u0 = us[0]
    rows = prof[0]
    y0 = Y(u0)
    t = HULL["transom"]
    vs = grid[0]
    mid = nrow - 1  # index of the keel in the station list
    n_out = 13  # rows 0..12 (keel .. cap outer top) close the transom's back
    for k in range(n_out - 1):
        P0, P1 = vs[mid - k], vs[mid - k - 1]
        S0, S1 = vs[mid + k], vs[mid + k + 1]
        m.face((P0, S0, S1, P1), rows[k][2], False)
    # top of the transom (from the back to its inner face)
    xo = rows[12][0]
    zt = rows[12][1]
    xi = rows[13][0]
    dz = deck_z(u0)
    tb = [m.v((-xo, y0, zt)), m.v((xo, y0, zt)), m.v((xi, y0 + t, zt)), m.v((-xi, y0 + t, zt))]
    m.face((tb[0], tb[1], tb[2], tb[3]), C["cap"], False)
    ti = [m.v((-xi, y0 + t, zt)), m.v((xi, y0 + t, zt)), m.v((xi, y0 + t, dz)), m.v((-xi, y0 + t, dz))]
    m.face((ti[0], ti[1], ti[2], ti[3]), C["bulwark"], False)  # faces the bow
    # bow bumper: a rubber pad down the stem
    zs = [0.62, 0.90, 1.18, top(1.0) - 0.06]
    rads = [0.06, 0.09, 0.09, 0.07]
    path = [Vector((0, Y(1.0, z) + r * 1.15 + 0.02, z)) for z, r in zip(zs, rads)]
    rings_ = [ring(p, Vector((0, 0.15, 1)), r, r * 1.15, n=6) for p, r in zip(path, rads)]
    m.tube(rings_, C["fender"], cap0=path[0] - Vector((0, 0, 0.06)), cap1=path[-1] + Vector((0, 0, 0.06)), smooth=True)
    bmesh.ops.remove_doubles(m.bm, verts=m.bm.verts[:], dist=1e-5)
    return m


def inner(u):
    """Half breadth of the open deck at station u (where the bulwark meets the deck)."""
    return hull_rows(u)[-1][0]


# ------------------------------------------------------------------------------------------------
# Deck and fittings
# ------------------------------------------------------------------------------------------------
def build_deck(col):
    m = Mesh("boat-deck")
    us = stations()
    t = HULL["transom"]
    y_start = Y(us[0]) + t
    n = 6
    # deck stations from just inside the transom to where the deck runs out at the bow
    du = [u for u in us if inner(u) > 0.02]
    du[0] = u_of(y_start)
    du.append(1.0)  # close the deck at the stem
    rows = []
    for u in du:
        w = inner(u) if u < 1.0 else 0.0
        z = deck_z(u) + 0.004
        rows.append([Vector((-w + 2 * w * k / n, Y(u, z), z)) for k in range(n + 1)])
    vr = [[m.v(p) for p in row] for row in rows]
    for i in range(len(vr) - 1):
        for k in range(n):
            colr = C["deck"][k % 2]
            m.face((vr[i][k], vr[i][k + 1], vr[i + 1][k + 1], vr[i + 1][k]), colr)
    # bow tip: close the deck at the last station that still has width
    # cleats on the cap: a foot and a horn
    ch = HULL["cap"][0]
    for u in (0.12, 0.84):
        for side in (1, -1):
            xg = x_at(u, top(u)) - 0.03
            zc = top(u) + ch
            y = Y(u, zc)
            quadbox(m, (side * xg, y, zc + 0.03), (0.07, 0.10, 0.06), C["chrome"])
            quadbox(m, (side * xg, y, zc + 0.075), (0.07, 0.30, 0.04), C["chrome"])
    # bow lights (red to port, green to starboard), on the cap near the bow
    u = 0.9
    for side, colr in ((-1, C["port"]), (1, C["starboard"])):
        zc = top(u) + ch
        xg = x_at(u, top(u)) - 0.05
        y = Y(u, zc)
        cyl(m, (side * xg, y, zc), (side * xg, y, zc + 0.06), 0.07, 0.07, C["steel"], n=6)
        ellipsoid(m, (side * xg, y, zc + 0.13), (0.085, 0.085, 0.085), colr, seg=6, rings=4, smooth=False)
    # rod holder: a short tube on the rod's axis, its butt at the game's ROD_BASE, braced to the cap
    B = Vector(FIT["rodBase"])
    A = Vector((math.sin(FIT["rodLean"]), 0, math.cos(FIT["rodLean"])))
    lo = B - A * 0.42
    hi = B + A * 0.04
    cyl(m, lo, hi, 0.065, 0.075, C["chrome"], n=8)
    cyl(m, hi - A * 0.02, hi + A * 0.03, 0.095, 0.095, C["rubber"], n=8)
    uB = u_of(B.y)
    xi = inner(uB)
    zc = top(uB) + ch
    foot = Vector((xi + 0.02, B.y, zc - 0.02))
    cyl(m, lo + A * 0.05, foot, 0.03, 0.03, C["chrome"], n=5)
    cyl(m, B - A * 0.12, Vector((xi + 0.05, B.y, zc + 0.01)), 0.03, 0.03, C["chrome"], n=5)
    # fish crate with two fish on top
    cx, cy, L, W, H = FIT["crate"]
    z0 = HULL["deck"]
    box(m, (cx, cy, z0 + H / 2), (W, L, H), C["crate"])
    for dz in (H * 0.33, H * 0.66):  # slat lines
        box(m, (cx, cy, z0 + dz), (W + 0.02, L + 0.02, 0.035), C["crateLid"])
    for sx in (-1, 1):  # rim along the long sides, and the ends with hand holes
        box(m, (cx + sx * (W / 2 - 0.03), cy, z0 + H + 0.02), (0.07, L + 0.02, 0.05), C["crateLid"])
    for sy in (-1, 1):
        box(m, (cx, cy + sy * (L / 2 - 0.03), z0 + H + 0.02), (W + 0.02, 0.07, 0.05), C["crateLid"])
        box(m, (cx, cy + sy * (L / 2 + 0.005), z0 + H * 0.78), (W * 0.4, 0.02, 0.07), C["rubber"])
    box(m, (cx, cy, z0 + H - 0.02), (W - 0.08, L - 0.08, 0.04), C["chrome"])  # ice
    for fx, fy, ang, colr in ((-0.10, -0.12, 0.35, C["fishA"]), (0.10, 0.10, -0.5, C["fishB"])):
        fish(m, Vector((cx + fx, cy + fy, z0 + H + 0.04)), ang, colr)
    # rope coil on the stern deck
    rx, ry = FIT["coil"]
    torus(m, (rx, ry, z0 + 0.05), (0, 0, 1), 0.26, 0.05, C["rope"], n1=12, n2=4)
    torus(m, (rx, ry, z0 + 0.13), (0, 0, 1), 0.18, 0.05, C["rope"], n1=10, n2=4)
    return m


def fish(m, c, ang, colr):
    """A small lying fish: a lozenge body, a forked tail and an eye dot."""
    R = Matrix.Rotation(ang, 3, "Z")
    P = lambda x, y, z: c + R @ Vector((x, y, z))
    L, W, H = 0.20, 0.06, 0.05
    ringp = [P(0, 0, -H), P(W, 0, 0), P(0, 0, H), P(-W, 0, 0)]
    nose, tailp = P(0, L, 0), P(0, -L * 0.9, 0)
    vr = [m.v(p) for p in ringp]
    vn, vt = m.v(nose), m.v(tailp)
    for j in range(4):
        k = (j + 1) % 4
        m.face((vn, vr[k], vr[j]), colr)
        m.face((vt, vr[j], vr[k]), colr)
    t0 = P(0, -L * 0.85, 0)
    m.face((m.v(t0), m.v(P(0.10, -L * 1.35, 0.02)), m.v(P(0, -L * 1.2, 0.02))), colr)
    m.face((m.v(t0), m.v(P(0, -L * 1.2, 0.02)), m.v(P(-0.10, -L * 1.35, 0.02))), colr)
    quadbox(m, P(0, L * 0.6, H * 0.55), (0.03, 0.03, 0.03), C["fishEye"])


# ------------------------------------------------------------------------------------------------
# Wheelhouse (canopy), lantern, pennant
# ------------------------------------------------------------------------------------------------
def build_canopy(col):
    K = CABIN
    m = Mesh("boat-canopy")
    y0, y1 = K["y"]
    cy = (y0 + y1) / 2
    hl = (y1 - y0) / 2
    hw = K["halfWidth"]
    z0 = HULL["deck"]
    z1 = z0 + K["height"]
    plan = rounded_rect(hw, hl, K["corner"], n=3, cy=cy)
    sc = K["taper"]
    bot = [Vector((x, y, z0)) for x, y in plan]
    topr = [Vector((x * sc, cy + (y - cy) * (0.5 + 0.5 * sc), z1)) for x, y in plan]
    m.tube([bot, topr], C["wall"])
    # roof: a rim (trim role) then a dome (hull role)
    o = K["roofOver"]
    rplan = rounded_rect(hw * sc + o, hl * (0.5 + 0.5 * sc) + o, K["corner"] + o * 0.8, n=3, cy=cy)
    rz0 = z1
    rz1 = z1 + K["roofRim"]
    rings_ = [
        [Vector((x * 0.80 + 0.0, cy + (y - cy) * 0.80, rz0)) for x, y in rplan],
        [Vector((x, y, rz0 + 0.02)) for x, y in rplan],
        [Vector((x, y, rz1)) for x, y in rplan],
        [Vector((x * 0.82, cy + (y - cy) * 0.82, rz1 + K["roofDome"] * 0.65)) for x, y in rplan],
        [Vector((x * 0.45, cy + (y - cy) * 0.45, rz1 + K["roofDome"])) for x, y in rplan],
    ]
    m.tube(rings_, [C["wall"], TRIM_PAINT, HULL_PAINT, HULL_PAINT, HULL_PAINT],
           cap0=Vector((0, cy, rz0)), cap1=Vector((0, cy, rz1 + K["roofDome"] + 0.02)))

    def wall_x(z):  # side wall half width at height z
        return hw * lerp(1.0, sc, (z - z0) / (z1 - z0))

    def wall_y(z, front):
        h = hl * lerp(1.0, 0.5 + 0.5 * sc, (z - z0) / (z1 - z0))
        return cy + h if front else cy - h

    # front window (frame then glass), leaning with the wall
    zw0, zw1 = z0 + 0.58, z0 + 1.0
    lean = math.atan2(hl * (1 - (0.5 + 0.5 * sc)), z1 - z0)
    Rf = Matrix.Rotation(-lean, 3, "X")
    for w, h, d, colr in ((1.12, 0.48, 0.03, C["frame"]), (1.0, 0.36, 0.05, C["glass"])):
        zc = (zw0 + zw1) / 2
        box(m, (0, wall_y(zc, True) + d / 2 - 0.005, zc), (w, d, h), colr, rot=Rf)
    # side portholes: a frame ring and a glass disc on each side
    zc = z0 + 0.78
    lean_x = math.atan2(hw * (1 - sc), z1 - z0)
    for side in (1, -1):
        for yy in (cy + 0.18,):
            xw = wall_x(zc)
            n_ = Vector((side * math.cos(lean_x), 0, math.sin(lean_x)))
            c_ = Vector((side * xw, yy, zc))
            torus(m, c_ + n_ * 0.02, n_, 0.20, 0.045, C["frame"], n1=10, n2=4, smooth=False)
            disc_rings = [ring(c_ - n_ * 0.01, n_, 0.19, n=10), ring(c_ + n_ * 0.03, n_, 0.19, n=10)]
            m.tube(disc_rings, C["glass"], cap1=c_ + n_ * 0.03)
    # back wall: a door to port, the life ring to starboard
    zc = z0 + 0.48
    box(m, (-0.22, wall_y(zc, False) - 0.015, zc), (0.52, 0.04, 0.90), C["door"], rot=Matrix.Rotation(lean, 3, "X"))
    box(m, (-0.22, wall_y(z0 + 0.72, False) - 0.04, z0 + 0.72), (0.30, 0.03, 0.22), C["glass"], rot=Matrix.Rotation(lean, 3, "X"))
    quadbox(m, (-0.04, wall_y(zc, False) - 0.05, zc), (0.05, 0.05, 0.05), C["knob"])
    lr = Vector((0.40, wall_y(z0 + 0.62, False) - 0.10, z0 + 0.62))
    torus(m, lr, (0, -1, 0.15), 0.25, 0.075, lambda i: C["ringRed"] if (i // 3) % 2 == 0 else C["ringWhite"], n1=12, n2=6, phase=math.pi / 12)
    # mast on the roof, toward the back so the pennant streams over the stern deck
    mx, my = 0.0, cy - 0.35
    mz0 = rz1 + K["roofDome"] * 0.55
    mz1 = mz0 + K["mast"]
    cyl(m, (mx, my, mz0 - 0.05), (mx, my, mz1), 0.05, 0.04, C["mast"], n=6)
    cyl(m, (mx, my, mz0 - 0.02), (mx, my, mz0 + 0.06), 0.10, 0.09, C["mast"], n=6)
    return m, Vector((0, cy, z0)), Vector((mx, my, mz1))


def build_lantern(base):
    m = Mesh("boat-lantern")
    b = Vector(base)
    up = Vector((0, 0, 1))
    cyl(m, b, b + up * 0.06, 0.13, 0.13, C["steel"], n=8)
    m.tube([ring(b + up * 0.06, up, 0.10, n=8), ring(b + up * 0.27, up, 0.10, n=8)], C["lamp"])
    for k in range(4):  # cage bars
        a = 2 * math.pi * k / 4 + math.pi / 4
        p = Vector((math.cos(a) * 0.11, math.sin(a) * 0.11, 0))
        quadbox(m, b + p + up * 0.165, (0.025, 0.025, 0.22), C["steel"])
    m.tube([ring(b + up * 0.27, up, 0.15, n=8), ring(b + up * 0.31, up, 0.15, n=8)], C["steel"], cap0=b + up * 0.27)
    m.tube([ring(b + up * 0.31, up, 0.15, n=8), ring(b + up * 0.40, up, 0.05, n=8)], C["steel"], cap1=b + up * 0.42)
    return m


def build_flag(pivot, segs=5):
    """A pennant streaming aft (toward -Y), with a gentle wave; tied to the mast at `pivot`."""
    m = Mesh("boat-flag")
    p = Vector(pivot)
    L, H, T = 0.78, 0.34, 0.015
    rows = []
    for i in range(segs + 1):
        f = i / segs
        y = p.y - 0.05 - L * f
        x = p.x + 0.06 * math.sin(f * math.pi * 1.6) * f
        h = H * (1 - f) * 0.5 + 0.012
        zc = p.z - H * 0.5 - 0.02 * f
        rows.append([Vector((x + T, y, zc - h)), Vector((x + T, y, zc + h)), Vector((x - T, y, zc + h)), Vector((x - T, y, zc - h))])
    # winding so faces point out (the rows run toward -Y)
    rows = [list(reversed(r)) for r in rows]
    m.tube(rows, TRIM_PAINT, cap0=sum(rows[0], Vector()) / 4)
    cyl(m, (p.x, p.y, p.z - H - 0.05), (p.x, p.y, p.z + 0.02), 0.05, 0.05, C["mast"], n=6, caps=True)  # the halyard sleeve
    return m


# ------------------------------------------------------------------------------------------------
# Outboard motor
# ------------------------------------------------------------------------------------------------
def build_engine():
    E = ENGINE
    m = Mesh("boat-engine")
    y0 = Y(0.0)
    zt = top(0.0) + HULL["cap"][0]
    pivot = Vector((0, y0 - 0.06, zt))
    yc = y0 - E["back"]
    # clamp bracket over the transom
    box(m, (0, y0 + 0.02, zt - 0.06), (0.32, 0.22, 0.16), C["steel"])
    box(m, (0, y0 - 0.12, zt - 0.10), (0.24, 0.18, 0.30), C["steel"])
    for sx in (-0.09, 0.09):
        cyl(m, (sx, y0 + 0.13, zt - 0.08), (sx, y0 + 0.13, zt - 0.32), 0.025, 0.025, C["chrome"], n=5)
    # cowling: a rounded lathe, white with a trim-role band and a dark cap
    zb = E["cowlZ"]
    prof = E["cowl"]
    rings_ = []
    cols = []
    band = [C["steel"], TRIM_PAINT, C["cowl"], C["cowl"], C["cowl"]]
    for i, (dz, rx, ry) in enumerate(prof):
        rings_.append(squircle((0, yc, zb + dz), rx, ry, n=12))
        cols.append(band[i])
    m.tube(rings_, cols, cap0=Vector((0, yc, zb - 0.02)), cap1=Vector((0, yc, zb + prof[-1][0] + 0.05)), smooth=True)
    # leg, plate, torpedo hub and a three-blade propeller
    zl = E["legDown"]
    leg = [ring((0, yc + 0.03, zb + 0.02), (0, 0, -1), 0.08, 0.14, n=6),
           ring((0, yc + 0.03, zl + 0.05), (0, 0, -1), 0.06, 0.11, n=6)]
    m.tube(leg, C["steel"], cap1=Vector((0, yc + 0.03, zl + 0.03)))
    box(m, (0, yc + 0.02, zl + 0.20), (0.26, 0.40, 0.03), C["steel"])
    hub0, hub1 = Vector((0, yc + 0.22, zl)), Vector((0, yc - 0.20, zl))
    m.tube([ring(hub0, hub1 - hub0, 0.06, n=6), ring((hub0 + hub1) / 2, hub1 - hub0, 0.075, n=6), ring(hub1, hub1 - hub0, 0.05, n=6)],
           C["steel"], cap0=hub0 + Vector((0, 0.04, 0)), cap1=hub1 - Vector((0, 0.04, 0)))
    pc = hub1 - Vector((0, 0.03, 0))
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.3
        d = Vector((math.cos(a), 0, math.sin(a)))
        R = Matrix.Rotation(a, 3, "Y")
        quadbox(m, pc + d * 0.13, (0.20, 0.03, 0.10), C["chrome"], rot=R @ Matrix.Rotation(0.5, 3, "X"))
    # skeg under the hub
    box(m, (0, yc + 0.06, zl - 0.12), (0.03, 0.14, 0.16), C["steel"])
    # tiller arm over the transom into the boat, with a rubber grip
    t0 = Vector((0.05, yc + 0.22, zb + 0.05))
    t1 = Vector((0.14, y0 + 0.30, zt + 0.10))
    cyl(m, t0, t1, 0.04, 0.035, C["steel"], n=6)
    cyl(m, t1 - (t1 - t0).normalized() * 0.02, t1 + (t1 - t0).normalized() * 0.16, 0.045, 0.045, C["rubber"], n=6)
    return m, pivot


# ------------------------------------------------------------------------------------------------
# Scene
# ------------------------------------------------------------------------------------------------
PARTS = ("boat-hull", "boat-deck", "boat-canopy", "boat-engine", "boat-flag", "boat-lantern")


def build_boat(col, palette=0):
    """The boat's parts under an empty `boat`. Returns (root, {part: triangles})."""
    root = bpy.data.objects.new("boat", None)
    root.empty_display_size = 1.0
    col.objects.link(root)
    tris = {}
    objs = []
    h = build_hull(col)
    tris["boat-hull"] = h.triangles()
    objs.append(h.object(col, (0, 0, 0), palette))
    d = build_deck(col)
    tris["boat-deck"] = d.triangles()
    objs.append(d.object(col, (0, 0, 0), palette))
    c, c_origin, mast_top = build_canopy(col)
    tris["boat-canopy"] = c.triangles()
    objs.append(c.object(col, c_origin, palette))
    e, pivot = build_engine()
    tris["boat-engine"] = e.triangles()
    objs.append(e.object(col, pivot, palette))
    f = build_flag(mast_top - Vector((0, 0, 0.08)))
    tris["boat-flag"] = f.triangles()
    objs.append(f.object(col, mast_top - Vector((0, 0, 0.08)), palette))
    ln = build_lantern(mast_top)
    tris["boat-lantern"] = ln.triangles()
    objs.append(ln.object(col, mast_top, palette))
    for o in objs:
        o.parent = root
    tris["total"] = sum(tris.values())
    return root, tris


def palette_copy(col, root, index, offset):
    """A linked copy of the boat (same meshes) whose role slots point at palette `index`'s colours:
    exactly how the game would recolour per player."""
    P = BOAT_PALETTES[index]
    r2 = bpy.data.objects.new(f"boat-p{index}", None)
    col.objects.link(r2)
    r2.location = offset
    mats = {ROLE_HULL: _named_role(f"{ROLE_HULL}-p{index}", P["hull"]), ROLE_TRIM: _named_role(f"{ROLE_TRIM}-p{index}", P["trim"])}
    for o in root.children:
        c = o.copy()  # shares the mesh
        c.name = f"{o.name}-p{index}"
        col.objects.link(c)
        c.parent = r2
        for slot in c.material_slots:
            role = slot.material.get("role") if slot.material else None
            if role in mats:
                slot.link = "OBJECT"
                slot.material = mats[role]
    return r2


def _named_role(name, hexint):
    m = role_mat(name, hexint)
    m["role"] = name.split("-p")[0]
    return m


def build_scene(scene_name="Boat"):
    """A NEW scene with the boat (palette 0) on a blue water plane, three palette copies for the
    recolour row (hidden except in that shot), soft key and fill light."""
    scene = bpy.data.scenes.get(scene_name) or bpy.data.scenes.new(scene_name)
    for o in list(scene.collection.all_objects):
        me = o.data if o.type == "MESH" and o.data.users == 1 else None
        bpy.data.objects.remove(o, do_unlink=True)
        if me is not None:
            bpy.data.meshes.remove(me)
    col = bpy.data.collections.get("boat")
    if col is None:
        col = bpy.data.collections.new("boat")
    if col.name not in [c.name for c in scene.collection.children]:
        scene.collection.children.link(col)
    root, tris = build_boat(col, 0)
    row = bpy.data.collections.get("boat-palettes") or bpy.data.collections.new("boat-palettes")
    if row.name not in [c.name for c in scene.collection.children]:
        scene.collection.children.link(row)
    for i, idx in enumerate((1, 2, 3)):
        palette_copy(row, root, idx, (0, 0, 0))
    # water plane (at the waterline) and a pale floor under the keel for the dry shots
    for name, z, colr, size in (("boat-water", 0.0, C["water"], 400), ("boat-floor", HULL["keel"] - 0.02, C["floor"], 60)):
        me = bpy.data.meshes.new(name)
        bm = bmesh.new()
        bmesh.ops.create_circle(bm, cap_ends=True, radius=size, segments=48)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(name, me)
        ob.location.z = z
        ob.data.materials.append(colour_mat(colr))
        scene.collection.objects.link(ob)
    world = bpy.data.worlds.get("boat-world") or bpy.data.worlds.new("boat-world")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.78, 0.86, 0.94, 1)
    bg.inputs["Strength"].default_value = 1.0
    scene.world = world
    for name, energy, colr, rot in (("boat-key", 3.2, (1.0, 0.95, 0.88), (50, 0, 35)),
                                    ("boat-fill", 1.0, (0.85, 0.9, 1.0), (62, 0, 200))):
        ld = bpy.data.lights.get(name) or bpy.data.lights.new(name, "SUN")
        ld.energy = energy
        ld.color = colr
        ld.angle = math.radians(8)
        lo = bpy.data.objects.new(name, ld)
        lo.rotation_euler = tuple(math.radians(a) for a in rot)
        scene.collection.objects.link(lo)
    cd = bpy.data.cameras.get("boat-cam") or bpy.data.cameras.new("boat-cam")
    cam = bpy.data.objects.new("boat-cam", cd)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = "BLENDER_EEVEE"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    try:
        scene.eevee.taa_render_samples = 32
    except AttributeError:
        pass
    aim(scene, "front3")
    return tris


def _show(scene, water=True, floor=False, row=False):
    for o in scene.objects:
        if o.name == "boat-water":
            o.hide_render = not water
        elif o.name == "boat-floor":
            o.hide_render = not floor
    row_col = bpy.data.collections.get("boat-palettes")
    if row_col is not None:
        for o in list(row_col.all_objects):
            o.hide_render = not row
            o.hide_viewport = not row
    main = scene.objects.get("boat")
    if main is not None:
        main.location = (0, 0, 0)


def aim(scene, shot):
    """side / front3 / rear3 / top / chase (the game camera) / palettes (row of four)."""
    cam = scene.camera
    cam.data.sensor_fit = "AUTO"
    cam.data.type = "PERSP"
    res = (1600, 900)
    if shot == "side":
        _show(scene, water=False, floor=True)
        cam.data.lens = 90
        eye, target = Vector((22.0, 0.0, 1.4)), Vector((0, 0.0, 0.75))
        res = (1600, 800)
    elif shot == "front3":
        _show(scene, water=True)
        cam.data.lens = 50
        eye, target = Vector((7.5, 10.5, 4.0)), Vector((0, 0.2, 0.9))
    elif shot == "rear3":
        _show(scene, water=True)
        cam.data.lens = 50
        eye, target = Vector((-7.5, -10.5, 4.6)), Vector((0, -0.4, 0.9))
    elif shot == "top":
        _show(scene, water=True)
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = 9.0
        eye, target = Vector((0, 0.0, 25.0)), Vector((0, 0.001, 0))
        res = (900, 1000)
    elif shot == "chase":
        _show(scene, water=True)
        cam.data.sensor_fit = "VERTICAL"
        cam.data.angle_y = 0.9  # babylon-scene.ts camera.fov (vertical)
        eye, target = Vector((0, -17.5, 9.6)), Vector((0, 34.0, 2.2))  # CHASE back, height, lookAhead
        res = (1688, 780)  # a phone in landscape, 844 x 390 at 2x
    elif shot == "palettes":
        _show(scene, water=True, row=True)
        cam.data.lens = 42
        eye, target = Vector((5.0, -19.0, 12.0)), Vector((0.3, 0.2, 0.6))
        res = (1800, 900)
    else:
        raise ValueError(shot)
    if shot == "palettes":
        main = scene.objects["boat"]
        main.location = (-6.3, 0, 0)
        for i, idx in enumerate((1, 2, 3)):
            scene.objects[f"boat-p{idx}"].location = (-2.1 + 4.2 * i, 0, 0)
    cam.location = eye
    cam.rotation_euler = (target - eye).to_track_quat("-Z", "Y").to_euler()
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100


def render(path, scene_name="Boat"):
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


def render_sheet(out_dir, scene_name="Boat"):
    """side, three-quarter front and rear, top, the chase camera, the boat about 120 px long, and
    the boat in four player palettes."""
    scene = bpy.data.scenes[scene_name]
    os.makedirs(out_dir, exist_ok=True)
    done = []
    for shot in ("side", "front3", "rear3", "top", "chase"):
        aim(scene, shot)
        done.append(render(os.path.join(out_dir, f"boat-{shot}.png"), scene_name))
    aim(scene, "front3")  # small: the frame is 1600 px * 0.12 = 192 px, the boat about 120 px long
    scene.render.resolution_percentage = 12
    done.append(render(os.path.join(out_dir, "boat-small.png"), scene_name))
    aim(scene, "chase")  # the chase view at the phone's real 844 x 390
    scene.render.resolution_percentage = 50
    done.append(render(os.path.join(out_dir, "boat-chase-phone.png"), scene_name))
    aim(scene, "palettes")
    done.append(render(os.path.join(out_dir, "boat-palettes.png"), scene_name))
    aim(scene, "front3")
    return done


# ------------------------------------------------------------------------------------------------
# GLB export
# ------------------------------------------------------------------------------------------------
GLB_NODES = {"hull": "boat-hull", "deck": "boat-deck", "canopy": "boat-canopy",
             "engine": "boat-engine", "flag": "boat-flag", "lantern": "boat-lantern"}


def export_glb(out_path, scene_name="Boat"):
    """Write public/models/boat.glb: the root `boat` with children hull, deck, canopy, engine, flag,
    lantern (pivots kept), COLOR_0 baked from the materials (role colours stay their exact palette-0
    hex: hull 0x2A6FB8, trim 0xFFD35A). The bow is Blender +Y here; the copy is turned 180 degrees
    about Z (vertices and part origins, no node rotation) so the exporter's Y-up conversion puts the
    bow at glTF +Z (Babylon -Z). The scene itself is untouched. Returns {node: triangles}."""
    src = bpy.data.scenes[scene_name]
    win = bpy.context.window
    prev = win.scene if win else None
    tmp = bpy.data.scenes.new("boat-export")
    if win:
        win.scene = tmp
    tris = {}
    root = src.objects["boat"]
    root.name = "boat-src"  # the copy takes the exact name (object names are global)
    r2 = bpy.data.objects.new("boat", None)
    tmp.collection.objects.link(r2)
    turn = Matrix.Rotation(math.pi, 4, "Z")
    try:
        for new, old in GLB_NODES.items():
            o = src.objects[old]
            c = o.copy()
            c.data = o.data.copy()
            c.name = new
            c.data.name = new
            tmp.collection.objects.link(c)
            c.parent = r2
            c.matrix_parent_inverse = Matrix.Identity(4)
            c.data.transform(turn)
            c.location = turn @ o.location
            lib.bake_colors(c)
            tris[new] = lib.triangles(c)
        bpy.context.view_layer.update()
        for x in bpy.data.objects:
            x.select_set(False)
        for o in [r2] + list(r2.children):
            o.select_set(True)
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=out_path, export_format="GLB", use_selection=True, use_active_scene=True,
            export_vertex_color="ACTIVE", export_materials="EXPORT", export_cameras=False,
            export_lights=False, export_apply=True, export_yup=True)
    finally:
        for o in list(r2.children) + [r2]:
            me = o.data if o.type == "MESH" else None
            bpy.data.objects.remove(o, do_unlink=True)
            if me is not None:
                bpy.data.meshes.remove(me)
        root.name = "boat"
        if win and prev is not None:
            win.scene = prev
        bpy.data.scenes.remove(tmp)
    tris["total"] = sum(tris.values())
    return tris
