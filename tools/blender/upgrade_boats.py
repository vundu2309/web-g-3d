"""Boat tiers 2, 3 and 4 and the shipyard for the upgrade shop (CONCEPT stage, no export yet).

The boats are the same family as the player's boat (tier 1, `boat.py`): the same hull lines, the
same painted bands and the same two colour ROLES the game recolours per player (boat-paint.ts):

    boat-hull   hull paint and the wheelhouse roof dome   (exact hex 0x2A6FB8 in the file)
    boat-trim   rubbing strip, roof rim, and on the bigger tiers the gantry, the funnel band,
                the drum flanges and the rails' top bars    (exact hex 0xFFD35A in the file)

The flag on every tier is boat.py's `build_flag`: the flag of Vietnam in the palette's own `flag`
colours (never a role, so the per-player repaint leaves it alone).

Each tier swaps `boat.HULL`, `boat.CABIN`, `boat.ENGINE` and `boat.FIT` for its own numbers while
it is built (see TIERS), reuses boat.py's hull, deck, lantern and flag builders, and adds its own
upgrades:

    tier 2 "launch"    8.4 m: twin outboards, bigger wheelhouse, fish hold hatch, foredeck rail,
                       fenders, stacked crates, a roof searchlight
    tier 3 "trawler"   9.6 m: inboard (rudder and propeller), long wheelhouse with three front
                       panes, funnel, a mast with a derrick boom and hook over the hold, a net drum
    tier 4 "flagship" 10.8 m: two-storey house (cabin and bridge), tall mast with crosstrees and a
                       radar bar, outrigger booms, a stern gantry with the net drum and hanging net,
                       a tender on the cabin roof, rails all round, a bow anchor

Axes as boat.py: metres, Z up, bow to +Y, origin at the waterline at midship.

The shipyard (`build_shipyard`) is a pier on piles with a slipway, a half-built hull (ribs and
part of its planking) on keel blocks and shores, a workshop shed with a red gable roof, a yellow
jib crane over the hull, a sign with a boat on it, barrels, rope, lumber, lanterns. Its sea side is
+Y (like the market pier's -Z in the game), its origin at the water level, deck at 0.8 m.

Never calls lib.reset(); adds NEW scenes ("UpgradeBoats", "Shipyard") to the running Blender:

    import sys; sys.path.insert(0, "/path/to/tools/blender")
    import importlib, boat, upgrade_boats as U; importlib.reload(boat); importlib.reload(U)
    U.build_boats_scene(); U.build_shipyard_scene(); U.render_all("/tmp/upgrade/")

Export (step 5; the same scenes, nothing is saved), five GLBs into public/models:

    U.build_boats_scene(); U.build_shipyard_scene()
    U.export_all("/path/to/public/models")   # boat.glb (tier 1 with the flag of Vietnam), boat-2/3/4.glb, shipyard.glb
"""
import copy, math, os, random
from contextlib import contextmanager
import bpy, bmesh
from mathutils import Matrix, Vector
import lib
import boat as B

PAL = lib.PAL
C = B.C
HULL_PAINT, TRIM_PAINT = B.HULL_PAINT, B.TRIM_PAINT
mix_hex, lerp = B.mix_hex, B.lerp
box, quadbox, cyl, ring, torus, ellipsoid = B.box, B.quadbox, B.cyl, B.ring, B.torus, B.ellipsoid

X = {
    "funnel": PAL["paint"]["funnel"],
    "funnelTop": PAL["fit"]["rubber"],
    "net": PAL["paint"]["net"],
    # the net drum's wound bands: the palette's nearest grey to net + 35 % rope (0x9EABA8; a mixed
    # colour would not be a palette colour), 5 per channel off
    "netBand": PAL["people"]["clothes"]["sneakerGrey"],
    "float": PAL["paint"]["coral"],
    "fender": PAL["paint"]["white"],
    "hatch": PAL["wood"]["dark"],
    "hatchLid": PAL["wood"]["light"],
    "dinghy": PAL["hut"]["rowboat"],
    "anchor": PAL["fit"]["anchor"],
    "radar": PAL["paint"]["white"],
    "searchlight": PAL["metal"]["light"],
}

# ------------------------------------------------------------------------------------------------
# Tunable numbers per tier (merged over boat.py's own HULL / CABIN / ENGINE / FIT)
# ------------------------------------------------------------------------------------------------
TIERS = {
    2: {
        "hull": {"length": 8.4, "halfBeam": 1.55, "sheerMid": 1.12, "sheerRise": 0.66, "keel": -0.66,
                 "deck": 0.80, "stations": 24, "rake": 0.42},
        "cabin": {"y": (0.25, 2.15), "halfWidth": 0.92, "height": 1.20, "mast": 1.55},
        "twin": 0.46,          # outboards at x = +-twin
        "hold": (0.0, -1.05, 1.05, 0.95),   # x, y, length, width of the fish hold hatch
        "crates": [(-0.86, -2.95, 0), (-0.86, -2.95, 1), (0.0, -3.30, 0)],  # x, y, stack level
        "rail": (0.60, 0.95),  # foredeck rail from / to station u
        "fenders": (0.30, 0.52, 0.74),
    },
    3: {
        "hull": {"length": 9.6, "halfBeam": 1.70, "sheerMid": 1.20, "sheerRise": 0.70, "keel": -0.72,
                 "deck": 0.84, "stations": 26, "rake": 0.48, "sternBeam": 0.90},
        "house": {"y": (0.55, 2.95), "halfWidth": 1.05, "height": 1.38, "corner": 0.30, "panes": 3, "side": 2},
        "mast": (0.0, 0.18, 4.1),     # x, y of the foot, height above the deck
        "boom": (-1.55, 2.6),        # y of the boom's end, its height above the deck
        "hold": (0.0, -1.45, 1.25, 1.05),
        "drum": (-3.55, 1.45, 0.34),  # y, width, radius
        "crates": [(-1.05, -2.55, 0), (-1.05, -2.55, 1), (1.12, -1.4, 0)],
        "rail": (0.62, 0.96),
        "fenders": (0.28, 0.48, 0.68),
    },
    4: {
        "hull": {"length": 10.8, "halfBeam": 1.86, "sheerMid": 1.28, "sheerRise": 0.74, "keel": -0.78,
                 "deck": 0.88, "stations": 28, "rake": 0.52, "sternBeam": 0.92},
        "house": {"y": (-0.05, 3.25), "halfWidth": 1.20, "height": 1.32, "corner": 0.32, "panes": 3, "side": 3},
        "bridge": {"y": (1.05, 3.05), "halfWidth": 0.98, "height": 1.12, "corner": 0.28, "panes": 3, "side": 2},
        "mast": 2.7,                  # above the bridge roof
        "outrigger": (4.5, 0.58),     # length, angle from vertical (radians)
        "gantry": (-4.85, 3.3),       # y, height above the deck
        "hold": (0.0, -1.9, 1.35, 1.15),
        "drum": (-4.15, 1.60, 0.38),
        "crates": [(-1.25, -2.85, 0), (-1.25, -2.85, 1), (1.25, -2.0, 0), (1.25, -2.55, 0)],
        "rail": (0.10, 0.96),
        "fenders": (0.26, 0.42, 0.58, 0.74),
    },
}


@contextmanager
def tier_params(t):
    """Swap boat.py's tunables for tier t's while building (restored afterwards)."""
    saved = (B.HULL, B.CABIN, B.ENGINE, B.FIT)
    T = TIERS[t]
    H = dict(saved[0]); H.update(T.get("hull", {}))
    K = dict(saved[1]); K.update(T.get("cabin", {}))
    E = dict(saved[2])
    hb = H["halfBeam"] / saved[0]["halfBeam"]
    E["cowlZ"] = saved[2]["cowlZ"] + (H["sheerMid"] - saved[0]["sheerMid"])
    E["legDown"] = saved[2]["legDown"] + (H["keel"] - saved[0]["keel"]) * 0.5
    F = dict(saved[3])
    stern = -H["length"] / 2
    F["rodBase"] = (1.25 * hb, stern + 1.18, H["deck"] + 0.57)
    cr = T["crates"][0]
    F["crate"] = (cr[0], cr[1], 0.80, 0.56, 0.36)
    F["coil"] = (0.30, stern + 0.62)
    B.HULL, B.CABIN, B.ENGINE, B.FIT = H, K, E, F
    try:
        yield H
    finally:
        B.HULL, B.CABIN, B.ENGINE, B.FIT = saved


# ------------------------------------------------------------------------------------------------
# Fittings shared by the tiers
# ------------------------------------------------------------------------------------------------
def cap_point(u, side, inset=0.06):
    H = B.HULL
    z = B.top(u) + H["cap"][0]
    return Vector((side * (B.x_at(u, B.top(u)) - inset), B.Y(u, z), z))


def rail(m, u0, u1, h=0.55, posts=6, both=True, bow=True):
    """Stanchions on the gunwale cap from u0 to u1 with a chrome rail and a trim-role top bar; with
    `bow` the two sides meet at the stem."""
    us = [lerp(u0, u1, i / (posts - 1)) for i in range(posts)]
    sides = (1, -1) if both else (1,)
    for side in sides:
        tops = []
        for u in us:
            p = cap_point(u, side, 0.07)
            cyl(m, p, p + Vector((0, 0, h)), 0.028, 0.028, C["chrome"], n=5, caps=False)
            tops.append(p + Vector((0, 0, h)))
        if bow and u1 > 0.9:
            stem = B.top(1.0) + B.HULL["cap"][0]
            tops.append(Vector((0, B.Y(1.0, stem) - 0.18, stem + h)))
        for a, b in zip(tops, tops[1:]):
            cyl(m, a, b, 0.04, 0.04, TRIM_PAINT, n=5, caps=False)
            mid_a, mid_b = a - Vector((0, 0, h * 0.5)), b - Vector((0, 0, h * 0.5))
            cyl(m, mid_a, mid_b, 0.02, 0.02, C["chrome"], n=4, caps=False)


def fenders(m, us, side_list=(1, -1)):
    """White fenders hanging on ropes outside the hull."""
    for u in us:
        for side in side_list:
            ztop = B.top(u) + 0.05
            zc = (B.HULL["boot"][1] + B.top(u)) / 2 - 0.05
            x = B.x_at(u, zc) + 0.16
            y = B.Y(u, zc)
            cyl(m, (side * (x - 0.10), y, ztop), (side * x, y, zc + 0.24), 0.015, 0.015, C["rope"], n=3, caps=False)
            m.tube([ring((side * x, y, zc + 0.24), (0, 0, -1), 0.06, n=8),
                    ring((side * x, y, zc + 0.16), (0, 0, -1), 0.12, n=8),
                    ring((side * x, y, zc - 0.16), (0, 0, -1), 0.12, n=8),
                    ring((side * x, y, zc - 0.24), (0, 0, -1), 0.06, n=8)], X["fender"],
                   cap0=Vector((side * x, y, zc + 0.26)), cap1=Vector((side * x, y, zc - 0.26)), smooth=True)


def hold(m, spec):
    """A raised fish hold coaming with a wooden lid, battens and two handles."""
    x, y, L, W = spec
    z0 = B.HULL["deck"]
    box(m, (x, y, z0 + 0.13), (W, L, 0.26), X["hatch"])
    box(m, (x, y, z0 + 0.29), (W - 0.08, L - 0.08, 0.06), X["hatchLid"])
    for k in (-1, 0, 1):
        box(m, (x, y + k * L * 0.3, z0 + 0.33), (W - 0.06, 0.06, 0.03), X["hatch"])
    for sx in (-1, 1):
        cyl(m, (x + sx * W * 0.25, y - 0.12, z0 + 0.33), (x + sx * W * 0.25, y + 0.12, z0 + 0.33), 0.025, 0.025, C["steel"], n=4)


def crate(m, x, y, level, rot=0.0, fishy=True):
    L, W, Hh = 0.80, 0.56, 0.36
    z0 = B.HULL["deck"] + level * (Hh + 0.02)
    R = Matrix.Rotation(rot, 3, "Z")
    P = lambda dx, dy, dz: Vector((x, y, z0)) + R @ Vector((dx, dy, dz))
    box(m, P(0, 0, Hh / 2), (W, L, Hh), C["crate"], rot=R)
    box(m, P(0, 0, Hh * 0.5), (W + 0.02, L + 0.02, 0.035), C["crateLid"], rot=R)
    for sx in (-1, 1):
        box(m, P(sx * (W / 2 - 0.03), 0, Hh + 0.02), (0.07, L + 0.02, 0.05), C["crateLid"], rot=R)
    for sy in (-1, 1):
        box(m, P(0, sy * (L / 2 - 0.03), Hh + 0.02), (W + 0.02, 0.07, 0.05), C["crateLid"], rot=R)
    if fishy:
        box(m, P(0, 0, Hh - 0.01), (W - 0.08, L - 0.08, 0.04), C["chrome"], rot=R)  # 0.01 m proud of the crate top (flush z-fought)
        B.fish(m, P(-0.08, -0.1, Hh + 0.04), rot + 0.3, C["fishA"])
        B.fish(m, P(0.1, 0.12, Hh + 0.04), rot - 0.4, C["fishB"])


def place_crates(m, specs):
    for i, (x, y, level) in enumerate(specs):
        if i == 0 and level == 0:
            continue  # boat.py's deck already draws this one (FIT["crate"])
        crate(m, x, y, level, rot=0.0 if level == 0 else 0.12, fishy=level > 0 or i > 1)


def net_drum(m, y, width, r):
    """A net drum across the stern: steel flanges, a drum wound with net, a few floats."""
    z = B.HULL["deck"] + r + 0.22
    for sx in (-1, 1):
        box(m, (sx * (width / 2 + 0.08), y, B.HULL["deck"] + (z - B.HULL["deck"]) / 2), (0.08, 0.30, z - B.HULL["deck"] + 0.1), C["steel"])
        cyl(m, (sx * width / 2, y, z), (sx * (width / 2 + 0.05), y, z), r + 0.16, r + 0.16, TRIM_PAINT, n=12)
    cyl(m, (-width / 2, y, z), (width / 2, y, z), r, r, X["net"], n=12, caps=False)
    for k in range(5):  # wound bands
        xk = -width / 2 + width * (k + 0.5) / 5
        cyl(m, (xk - 0.07, y, z), (xk + 0.07, y, z), r + 0.04, r + 0.04, X["netBand"], n=12, caps=False)
    for k in range(3):
        xk = -width / 2 + width * (k + 0.5) / 3
        ellipsoid(m, (xk, y - 0.04, z + r + 0.07), (0.09, 0.09, 0.09), X["float"], seg=6, rings=4, smooth=True)
    return z


def funnel(m, c, rx, ry, h, rake=0.12):
    """A raked funnel: red with a trim-role band and a dark cap."""
    c = Vector(c)
    rows, cols = [], []
    prof = [(0.0, 1.0, X["funnel"]), (0.55, 0.98, TRIM_PAINT), (0.72, 0.97, X["funnel"]), (0.9, 0.96, X["funnelTop"]), (1.0, 0.96, X["funnelTop"])]
    for f, s, col in prof:
        rows.append(B.squircle(c + Vector((0, -rake * f, h * f)), rx * s, ry * s, n=10))
        cols.append(col)
    m.tube(rows, cols[:-1] + [cols[-1]], cap0=c, cap1=c + Vector((0, -rake, h - 0.02)))


def house(m, cy, hl, hw, z0, h, corner=0.26, taper=0.94, panes=3, side=2, roof="dome", over=0.20,
          rim=0.13, dome=0.16, door=True, life_ring=True, wall=None):
    """A wheelhouse block: walls (cream), front panes, side windows, a back door and life ring,
    and a roof: 'dome' (trim-role rim, hull-role dome, as tier 1) or 'flat' (trim-role rim and a
    wooden top to stand things on). Returns the roof's top z."""
    wall = wall or C["wall"]
    z1 = z0 + h
    plan = B.rounded_rect(hw, hl, corner, n=3, cy=cy)
    sx_, sy_ = taper, 0.5 + 0.5 * taper
    bot = [Vector((x, y, z0)) for x, y in plan]
    topr = [Vector((x * sx_, cy + (y - cy) * sy_, z1)) for x, y in plan]
    m.tube([bot, topr], wall)

    def wall_x(z):
        return hw * lerp(1.0, sx_, (z - z0) / h)

    def wall_y(z, front):
        d = hl * lerp(1.0, sy_, (z - z0) / h)
        return cy + d if front else cy - d

    lean = math.atan2(hl * (1 - sy_), h)
    lean_x = math.atan2(hw * (1 - sx_), h)
    # front: a frame band and N glass panes
    zw0, zw1 = z0 + h * 0.50, z0 + h * 0.88
    zc = (zw0 + zw1) / 2
    avail = 2 * (wall_x(zc) - corner * 0.75)
    Rf = Matrix.Rotation(-lean, 3, "X")
    yf = wall_y(zc, True)
    box(m, (0, yf + 0.010, zc), (avail + 0.10, 0.03, zw1 - zw0 + 0.12), C["frame"], rot=Rf)
    pw = (avail - 0.07 * (panes - 1)) / panes
    for k in range(panes):
        x = -avail / 2 + pw / 2 + k * (pw + 0.07)
        box(m, (x, yf + 0.03, zc), (pw, 0.03, zw1 - zw0), C["glass"], rot=Rf)
    # sides: windows along the wall
    span = 2 * (hl - corner) * 0.9
    for s in (1, -1):
        Rs = Matrix.Rotation(-s * lean_x, 3, "Y")
        xw = wall_x(zc)
        for k in range(side):
            y = cy - span / 2 + span * (k + 0.5) / side
            w = min(0.62, span / side - 0.18)
            box(m, (s * (xw + 0.010), y, zc), (0.03, w + 0.10, zw1 - zw0 + 0.10), C["frame"], rot=Rs)
            box(m, (s * (xw + 0.03), y, zc), (0.03, w, zw1 - zw0 - 0.02), C["glass"], rot=Rs)
    # back: door to port, life ring to starboard
    Rb = Matrix.Rotation(lean, 3, "X")
    if door:
        zd = z0 + min(0.95, h * 0.75) / 2 + 0.02
        dh = min(0.95, h * 0.75)
        box(m, (-hw * 0.3, wall_y(zd, False) - 0.015, zd), (0.54, 0.04, dh), C["door"], rot=Rb)
        box(m, (-hw * 0.3, wall_y(zd + dh * 0.25, False) - 0.035, zd + dh * 0.25), (0.30, 0.03, 0.22), C["glass"], rot=Rb)
        quadbox(m, (-hw * 0.3 + 0.18, wall_y(zd, False) - 0.05, zd), (0.05, 0.05, 0.05), C["knob"])
    if life_ring:
        zl = z0 + h * 0.55
        torus(m, (hw * 0.45, wall_y(zl, False) - 0.10, zl), (0, -1, 0.15), 0.25, 0.075,
              lambda i: C["ringRed"] if (i // 3) % 2 == 0 else C["ringWhite"], n1=12, n2=6, phase=math.pi / 12)
    # roof
    rplan = B.rounded_rect(hw * sx_ + over, hl * sy_ + over, corner + over * 0.8, n=3, cy=cy)
    rz0, rz1 = z1, z1 + rim
    if roof == "dome":
        rings_ = [
            [Vector((x * 0.80, cy + (y - cy) * 0.80, rz0)) for x, y in rplan],
            [Vector((x, y, rz0 + 0.02)) for x, y in rplan],
            [Vector((x, y, rz1)) for x, y in rplan],
            [Vector((x * 0.82, cy + (y - cy) * 0.82, rz1 + dome * 0.65)) for x, y in rplan],
            [Vector((x * 0.45, cy + (y - cy) * 0.45, rz1 + dome)) for x, y in rplan],
        ]
        m.tube(rings_, [wall, TRIM_PAINT, HULL_PAINT, HULL_PAINT, HULL_PAINT],
               cap0=Vector((0, cy, rz0)), cap1=Vector((0, cy, rz1 + dome + 0.02)))
        return rz1 + dome
    rings_ = [
        [Vector((x * 0.85, cy + (y - cy) * 0.85, rz0)) for x, y in rplan],
        [Vector((x, y, rz0 + 0.02)) for x, y in rplan],
        [Vector((x, y, rz1)) for x, y in rplan],
    ]
    m.tube(rings_, [wall, TRIM_PAINT, C["cap"]], cap0=Vector((0, cy, rz0)), cap1=Vector((0, cy, rz1)))
    return rz1


def mast(m, foot, height, crosstree=0.0, radar=False):
    """A wooden mast from `foot`; returns the top point (for the lantern and flag)."""
    foot = Vector(foot)
    top_ = foot + Vector((0, 0, height))
    cyl(m, foot - Vector((0, 0, 0.05)), top_, 0.075, 0.05, C["mast"], n=6)
    cyl(m, foot - Vector((0, 0, 0.02)), foot + Vector((0, 0, 0.08)), 0.14, 0.13, C["mast"], n=6)
    if crosstree:
        z = top_.z - height * 0.28
        cyl(m, (foot.x - crosstree, foot.y, z), (foot.x + crosstree, foot.y, z), 0.035, 0.035, C["mast"], n=5)
        for s in (1, -1):  # little lamps at the ends
            ellipsoid(m, (foot.x + s * crosstree, foot.y, z + 0.05), (0.05, 0.05, 0.05), C["port"] if s < 0 else C["starboard"], seg=5, rings=3, smooth=False)
    if radar:
        z = top_.z - height * 0.5
        box(m, (foot.x, foot.y + 0.10, z), (0.12, 0.2, 0.1), C["steel"])
        box(m, (foot.x, foot.y + 0.10, z + 0.12), (1.05, 0.12, 0.07), X["radar"])
    return top_


def stays(m, top_, points):
    for p in points:
        cyl(m, top_, Vector(p), 0.012, 0.012, C["rope"], n=3, caps=False)


def searchlight(m, c, aim=(0, 1, 0)):
    c = Vector(c)
    cyl(m, c, c + Vector((0, 0, 0.14)), 0.03, 0.03, C["steel"], n=5)
    a = Vector(aim).normalized()
    p = c + Vector((0, 0, 0.22))
    cyl(m, p - a * 0.12, p + a * 0.12, 0.10, 0.12, X["searchlight"], n=8)
    cyl(m, p + a * 0.12, p + a * 0.13, 0.10, 0.10, PAL["light"]["lamp"], n=8)


def hook_block(m, top_, drop):
    """A rope falling from `top_` with a pulley block and a hook."""
    top_ = Vector(top_)
    end = top_ - Vector((0, 0, drop))
    cyl(m, top_, end, 0.014, 0.014, C["rope"], n=3, caps=False)
    box(m, end - Vector((0, 0, 0.09)), (0.10, 0.06, 0.18), C["steel"])
    torus(m, end - Vector((0, 0, 0.27)), (1, 0, 0), 0.07, 0.02, C["steel"], n1=8, n2=4)


def dinghy(m, c, L=2.2, W=1.0, Hh=0.42, col=None):
    """A small tender: a rounded hull (colour) with a wooden top cover."""
    c = Vector(c)
    col = col or X["dinghy"]
    rows = []
    n = 9
    for i in range(n + 1):
        f = i / n
        y = -L / 2 + L * f
        w = W / 2 * math.sqrt(max(0.0, 1 - ((f - 0.42) / 0.58) ** 2 if f > 0.42 else 1 - ((0.42 - f) / 0.42) ** 4)) + 0.002
        h = Hh * (0.55 + 0.45 * math.sqrt(max(0.0, w / (W / 2))))
        rows.append([c + Vector((w * math.cos(a), y, -h * max(0.0, math.sin(-a)) if math.sin(a) < 0 else 0.0))
                     for a in (math.pi * k / 4 for k in range(-4, 1))])
    vr = [[m.v(p) for p in row] for row in rows]
    vl = [[m.v(c + Vector((-(p - c).x, (p - c).y, (p - c).z))) for p in row] for row in rows]
    for i in range(n):
        for j in range(4):
            m.face((vr[i][j], vr[i + 1][j], vr[i + 1][j + 1], vr[i][j + 1]), col)
            m.face((vl[i][j], vl[i][j + 1], vl[i + 1][j + 1], vl[i + 1][j]), col)
    # top cover (wood) between the two gunwales
    for i in range(n):
        m.face((vl[i][4], vl[i + 1][4], vr[i + 1][4], vr[i][4]), C["cap"])
    # gunwale rim
    for s in (1, -1):
        pts = [c + Vector((s * (row[4] - c).x, (row[4] - c).y, 0.03)) for row in rows]
        for a, b in zip(pts, pts[1:]):
            cyl(m, a, b, 0.035, 0.035, C["ringWhite"], n=4, caps=False)


def anchor(m, c, side):
    """A bow anchor hanging at the hawse (steel)."""
    c = Vector(c)
    s = side
    cyl(m, c, c + Vector((0, 0, -0.55)), 0.035, 0.035, X["anchor"], n=5)
    cyl(m, c + Vector((0, -0.18, -0.12)), c + Vector((0, 0.18, -0.12)), 0.025, 0.025, X["anchor"], n=4)
    for k in (-1, 1):
        cyl(m, c + Vector((0, 0, -0.55)), c + Vector((0, k * 0.22, -0.38)), 0.03, 0.03, X["anchor"], n=4)
    torus(m, c + Vector((0, 0, 0.05)), (s, 0, 0), 0.06, 0.018, X["anchor"], n1=8, n2=4)


def inboard(stern_y, keel, deck):
    """Engine part of tiers 3 and 4: a skeg, a propeller and a rudder under the stern, and an
    exhaust stub; origin at the propeller shaft's exit."""
    m = B.Mesh("boat-engine")
    y = stern_y + 0.55
    zc = keel + 0.30
    box(m, (0, y + 0.55, keel + 0.06), (0.10, 1.4, 0.16), C["antifoul"])  # skeg
    cyl(m, (0, y + 0.3, zc), (0, y - 0.15, zc), 0.05, 0.05, C["chrome"], n=6)
    cyl(m, (0, y - 0.10, zc), (0, y - 0.30, zc), 0.09, 0.06, C["steel"], n=6)
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.4
        d = Vector((math.cos(a), 0, math.sin(a)))
        quadbox(m, Vector((0, y - 0.2, zc)) + d * 0.18, (0.26, 0.04, 0.14), C["chrome"], rot=Matrix.Rotation(a, 3, "Y") @ Matrix.Rotation(0.5, 3, "X"))
    box(m, (0, y - 0.62, zc + 0.12), (0.05, 0.42, 0.72), C["steel"])  # rudder
    cyl(m, (0, y - 0.48, zc + 0.48), (0, y - 0.48, deck + 0.1), 0.03, 0.03, C["steel"], n=4)
    return m, Vector((0, y, zc))


# ------------------------------------------------------------------------------------------------
# Tiers
# ------------------------------------------------------------------------------------------------
def _finish(col, root, parts, tier, palette=0):
    tris = {}
    for name, (m, origin) in parts.items():
        tris[name] = m.triangles()
        o = m.object(col, origin, palette)
        o.name = f"t{tier}-{name}"
        o.data.name = o.name
        o.parent = root
    tris["total"] = sum(tris.values())
    return tris


def build_tier1(col):
    root, tris = B.build_boat(col, 0)
    root.name = "boat-t1"
    for o in root.children:
        o.name = "t1-" + o.name.split(".")[0].replace("boat-", "")
        o.data.name = o.name
    return root, tris


def build_tier2(col):
    T = TIERS[2]
    with tier_params(2) as H:
        root = bpy.data.objects.new("boat-t2", None)
        col.objects.link(root)
        hull = B.build_hull(col)
        fenders(hull, T["fenders"])
        deck = B.build_deck(col)
        hold(deck, T["hold"])
        place_crates(deck, T["crates"])
        rail(deck, *T["rail"], h=0.5, posts=5)
        canopy, c_origin, mast_top = B.build_canopy(col)
        K = B.CABIN
        roof_z = H["deck"] + K["height"] + K["roofRim"] + K["roofDome"] * 0.8
        searchlight(canopy, (0.35, K["y"][1] - 0.25, roof_z - 0.04))
        engines = {}
        for i, sx in enumerate((-T["twin"], T["twin"])):
            e, pivot = B.build_engine()
            bmesh.ops.translate(e.bm, verts=e.bm.verts[:], vec=(sx, 0, 0))
            e.name = f"boat-engine-{i + 1}"
            engines[f"engine-{i + 1}"] = (e, pivot + Vector((sx, 0, 0)))
        flag = B.build_flag(mast_top - Vector((0, 0, 0.08)))
        lan = B.build_lantern(mast_top)
        parts = {"hull": (hull, (0, 0, 0)), "deck": (deck, (0, 0, 0)), "canopy": (canopy, c_origin)}
        parts.update(engines)
        parts["flag"] = (flag, mast_top - Vector((0, 0, 0.08)))
        parts["lantern"] = (lan, mast_top)
        return root, _finish(col, root, parts, 2)


def build_tier3(col):
    T = TIERS[3]
    with tier_params(3) as H:
        root = bpy.data.objects.new("boat-t3", None)
        col.objects.link(root)
        hull = B.build_hull(col)
        fenders(hull, T["fenders"])
        deck = B.build_deck(col)
        hold(deck, T["hold"])
        place_crates(deck, T["crates"])
        rail(deck, *T["rail"], h=0.55, posts=6)
        dy, dw, dr = T["drum"]
        net_drum(deck, dy, dw, dr)
        canopy = B.Mesh("boat-canopy")
        hs = T["house"]
        y0, y1 = hs["y"]
        cy, hl = (y0 + y1) / 2, (y1 - y0) / 2
        z0 = H["deck"]
        roof_z = house(canopy, cy, hl, hs["halfWidth"], z0, hs["height"], hs["corner"], panes=hs["panes"], side=hs["side"])
        funnel(canopy, (0.0, y0 + 0.55, roof_z - 0.10), 0.22, 0.30, 1.05)
        searchlight(canopy, (0.5, y1 - 0.25, roof_z - 0.05))
        searchlight(canopy, (-0.5, y1 - 0.25, roof_z - 0.05))
        # mast behind the house with a derrick boom over the hold
        mx, my, mh = T["mast"]
        top_ = mast(canopy, (mx, my, z0), mh, crosstree=0.75)
        by, bh = T["boom"]
        foot = Vector((mx, my - 0.1, z0 + 1.0))
        end = Vector((0, by, z0 + bh))
        cyl(canopy, foot, end, 0.06, 0.045, C["mast"], n=6)
        cyl(canopy, top_ - Vector((0, 0, 0.4)), end, 0.013, 0.013, C["rope"], n=3, caps=False)
        hook_block(canopy, end, 1.0)
        stays(canopy, top_ - Vector((0, 0, 0.3)), [cap_point(0.55, 1, 0.1), cap_point(0.55, -1, 0.1)])
        stays(canopy, top_ - Vector((0, 0, 0.3)), [Vector((0, B.Y(1.0, B.top(1.0)) - 0.25, B.top(1.0) + 0.1))])
        eng, pivot = inboard(-H["length"] / 2, H["keel"], H["deck"])
        flag = B.build_flag(top_ - Vector((0, 0, 0.08)))
        lan = B.build_lantern(top_)
        parts = {"hull": (hull, (0, 0, 0)), "deck": (deck, (0, 0, 0)), "canopy": (canopy, (0, cy, z0)),
                 "engine": (eng, pivot), "flag": (flag, top_ - Vector((0, 0, 0.08))), "lantern": (lan, top_)}
        return root, _finish(col, root, parts, 3)


def build_tier4(col):
    T = TIERS[4]
    with tier_params(4) as H:
        root = bpy.data.objects.new("boat-t4", None)
        col.objects.link(root)
        hull = B.build_hull(col)
        fenders(hull, T["fenders"])
        stem_z = B.top(0.93)
        for s in (1, -1):
            anchor(hull, Vector((s * (B.x_at(0.93, stem_z - 0.15) + 0.06), B.Y(0.93, stem_z - 0.15), stem_z - 0.15)), s)
        deck = B.build_deck(col)
        hold(deck, T["hold"])
        place_crates(deck, T["crates"])
        rail(deck, *T["rail"], h=0.6, posts=11)
        dy, dw, dr = T["drum"]
        dz = net_drum(deck, dy, dw, dr)
        canopy = B.Mesh("boat-canopy")
        z0 = H["deck"]
        hs = T["house"]
        y0, y1 = hs["y"]
        cy, hl = (y0 + y1) / 2, (y1 - y0) / 2
        roof1 = house(canopy, cy, hl, hs["halfWidth"], z0, hs["height"], hs["corner"], panes=hs["panes"], side=hs["side"], roof="flat", over=0.14, door=True)
        bs = T["bridge"]
        b0, b1 = bs["y"]
        bcy, bhl = (b0 + b1) / 2, (b1 - b0) / 2
        roof2 = house(canopy, bcy, bhl, bs["halfWidth"], roof1, bs["height"], bs["corner"], panes=bs["panes"], side=bs["side"], door=False, life_ring=False)
        # rail round the cabin roof
        rw, rl0, rl1 = hs["halfWidth"] * 0.94 + 0.08, y0 - 0.08, y1 + 0.02
        corners = [(-rw, rl0), (rw, rl0), (rw, rl1), (-rw, rl1)]
        for (xa, ya), (xb, yb) in zip(corners, corners[1:] + corners[:1]):
            if ya == yb and ya > cy:
                continue  # no rail across the front (the bridge windows look over it)
            pa, pb = Vector((xa, ya, roof1 + 0.45)), Vector((xb, yb, roof1 + 0.45))
            cyl(canopy, pa, pb, 0.035, 0.035, TRIM_PAINT, n=5, caps=False)
            n_ = max(2, int((pb - pa).length / 0.7))
            for k in range(n_ + 1):
                p = pa.lerp(pb, k / n_)
                cyl(canopy, p - Vector((0, 0, 0.45)), p, 0.022, 0.022, C["chrome"], n=4, caps=False)
        # the tender on the cabin roof, aft of the bridge, and the funnel beside it
        dinghy(canopy, Vector((0.32, y0 + 0.55, roof1 + 0.40)), L=1.0, W=0.62, Hh=0.26)
        for s in (-1,):
            box(canopy, (0.32, y0 + 0.55, roof1 + 0.10), (0.55, 0.12, 0.20), C["cap"])
        funnel(canopy, (-0.55, y0 + 0.55, roof1 - 0.02), 0.20, 0.28, 1.15)
        searchlight(canopy, (0.45, b1 - 0.2, roof2 - 0.05))
        # tall mast with crosstrees and radar on the bridge roof
        top_ = mast(canopy, (0, bcy - 0.2, roof2 - 0.05), T["mast"], crosstree=0.85, radar=True)
        stays(canopy, top_ - Vector((0, 0, 0.3)), [Vector((0, B.Y(1.0, B.top(1.0)) - 0.3, B.top(1.0) + 0.12))])
        # outrigger booms raised in a V, pivoting at the cabin roof's sides
        L, ang = T["outrigger"]
        for s in (1, -1):
            foot = Vector((s * (hs["halfWidth"] * 0.92), bcy - 0.9, roof1 + 0.05))
            d = Vector((s * math.sin(ang), -0.12, math.cos(ang))).normalized()
            tip = foot + d * L
            cyl(canopy, foot, tip, 0.065, 0.04, C["mast"], n=6)
            cyl(canopy, foot - Vector((0, 0, 0.1)), foot + Vector((0, 0, 0.12)), 0.11, 0.11, C["steel"], n=6)
            cyl(canopy, top_ - Vector((0, 0, 0.55)), tip, 0.012, 0.012, C["rope"], n=3, caps=False)
            hook_block(canopy, tip, 0.9)
            ellipsoid(canopy, tip - Vector((0, 0, 1.25)), (0.10, 0.10, 0.12), X["float"], seg=6, rings=4)
        # stern gantry (trim role) over the net drum, with a hanging net
        gy, gh = T["gantry"]
        ug = B.u_of(gy)
        legs = []
        for s in (1, -1):
            p = cap_point(ug, s, 0.15) - Vector((0, 0, B.HULL["cap"][0]))
            q = Vector((s * 0.9, gy - 0.25, z0 + gh))
            cyl(canopy, p, q, 0.09, 0.08, TRIM_PAINT, n=6)
            legs.append(q)
        cyl(canopy, legs[0] + Vector((0.08, 0, 0)), legs[1] - Vector((0.08, 0, 0)), 0.10, 0.10, TRIM_PAINT, n=6)
        for s in (1, -1):
            box(canopy, Vector((s * 0.9, gy - 0.25, z0 + gh)), (0.24, 0.24, 0.24), C["steel"])
        hook_block(canopy, Vector((0, gy - 0.25, z0 + gh - 0.1)), 0.7)
        # the net hanging from the drum over the stern (a draped sheet)
        rows = []
        for i in range(5):
            f = i / 4
            yy = lerp(dy - dr * 0.9, -H["length"] / 2 - 0.05, f)
            zz = lerp(dz - dr * 0.4, B.top(0.0) + 0.2, f) - 0.15 * math.sin(f * math.pi)
            rows.append([Vector((x, yy, zz - 0.04 * (k % 2))) for k, x in enumerate((-0.6, -0.3, 0.0, 0.3, 0.6))])
        vr = [[canopy.v(p) for p in r] for r in rows]
        for i in range(4):
            for k in range(4):
                canopy.face((vr[i][k], vr[i][k + 1], vr[i + 1][k + 1], vr[i + 1][k]), X["net"])
                canopy.face((vr[i][k], vr[i + 1][k], vr[i + 1][k + 1], vr[i][k + 1]), X["net"])
        eng, pivot = inboard(-H["length"] / 2, H["keel"], H["deck"])
        flag = B.build_flag(top_ - Vector((0, 0, 0.08)))
        lan = B.build_lantern(top_)
        parts = {"hull": (hull, (0, 0, 0)), "deck": (deck, (0, 0, 0)), "canopy": (canopy, (0, cy, z0)),
                 "engine": (eng, pivot), "flag": (flag, top_ - Vector((0, 0, 0.08))), "lantern": (lan, top_)}
        return root, _finish(col, root, parts, 4)


BUILDERS = {1: build_tier1, 2: build_tier2, 3: build_tier3, 4: build_tier4}
LINEUP_X = {1: -10.5, 2: -3.6, 3: 4.1, 4: 12.6}
SIDE_Y = {1: -16.0, 2: -6.5, 3: 4.2, 4: 16.2}  # bow to stern with ~1.5 m gaps (side line-up shot)


# ------------------------------------------------------------------------------------------------
# Shipyard
# ------------------------------------------------------------------------------------------------
W = PAL["wood"]
YARD = {
    "deck": 0.8,                  # deck height above the water (the market's DECK)
    "platform": (-10.0, 10.0, -6.0, 1.5),   # x0, x1, y0, y1
    "slip": (0.6, 5.4, 6.2, -0.7),          # x0, x1, sea end y, sea end z
    "jetty": (-9.6, -7.6, 6.0),             # x0, x1, end y
    "shed": (-9.6, -2.2, -5.8, -1.4, 2.9),  # x0, x1, y0, y1, wall height
    "hull": (3.0, -2.2, 7.4),               # x, y centre, length of the hull on the stocks
    "crane": (7.0, -1.6, 6.2, 4.4),         # x, y of the post, height, jib reach
    "seed": 7,
}
ROOF = PAL["paint"]["red"]
ROOF_DARK = PAL["paint"]["redDeep"]
PRIMER = PAL["paint"]["redDeep"]
PLANKED = 0.62   # share of the hull (from the stern) already planked


def plank_floor(m, x0, x1, y0, y1, z, along="x", width=0.42, thick=0.12, seed=1):
    rng = random.Random(seed)
    if along == "x":
        n = int(round((y1 - y0) / width))
        for i in range(n):
            y = y0 + (i + 0.5) * (y1 - y0) / n
            col = W["deck"][i % 2] if rng.random() > 0.15 else W["light"]
            quadbox(m, ((x0 + x1) / 2, y, z - thick / 2), (x1 - x0, (y1 - y0) / n - 0.035, thick), col)
    else:
        n = int(round((x1 - x0) / width))
        for i in range(n):
            x = x0 + (i + 0.5) * (x1 - x0) / n
            col = W["deck"][i % 2] if rng.random() > 0.15 else W["light"]
            quadbox(m, (x, (y0 + y1) / 2, z - thick / 2), ((x1 - x0) / n - 0.035, y1 - y0, thick), col)


def pile(m, x, y, top_z, r=0.2, bottom=-1.6, rope=True):
    cyl(m, (x, y, bottom), (x, y, top_z), r * 1.1, r, W["dark"], n=6, caps=False)
    cyl(m, (x, y, top_z), (x, y, top_z + 0.08), r * 1.15, r * 1.15, W["trim"], n=6)
    if rope:
        cyl(m, (x, y, top_z - 0.55), (x, y, top_z - 0.3), r * 1.12, r * 1.12, C["rope"], n=6, caps=False)


def barrel(m, x, y, z, r=0.32, h=0.85, col=None):
    col = col or PAL["fit"]["barrel"]
    rows = [ring((x, y, z + h * f), (0, 0, 1), r * (1 + 0.12 * math.sin(f * math.pi)), n=10) for f in (0, 0.2, 0.5, 0.8, 1)]
    m.tube(rows, [col, C["steel"], col, C["steel"], col], cap0=Vector((x, y, z)), cap1=Vector((x, y, z + h)))


def coil(m, x, y, z, r=0.36):
    torus(m, (x, y, z + 0.06), (0, 0, 1), r, 0.06, C["rope"], n1=12, n2=4)
    torus(m, (x, y, z + 0.17), (0, 0, 1), r * 0.7, 0.06, C["rope"], n1=10, n2=4)


def lamp_post(m, x, y, z, h=2.4):
    cyl(m, (x, y, z), (x, y, z + h), 0.07, 0.06, W["dark"], n=6)
    cyl(m, (x, y, z + h), (x + 0.35, y, z + h), 0.04, 0.04, W["dark"], n=4)
    c = Vector((x + 0.35, y, z + h - 0.35))
    cyl(m, c + Vector((0, 0, 0.30)), c + Vector((0, 0, 0.35)), 0.03, 0.03, C["steel"], n=4)
    m.tube([ring(c, (0, 0, 1), 0.11, n=6), ring(c + Vector((0, 0, 0.22)), (0, 0, 1), 0.11, n=6)], PAL["light"]["lamp"],
           cap0=c, cap1=c + Vector((0, 0, 0.22)))
    m.tube([ring(c + Vector((0, 0, 0.22)), (0, 0, 1), 0.16, n=6), ring(c + Vector((0, 0, 0.32)), (0, 0, 1), 0.04, n=6)], C["steel"],
           cap0=c + Vector((0, 0, 0.22)))


def frame_hull(m, cx, cy, z_deck, length, block=0.75):
    """A hull being built: keel, stem and sternpost, ribs, the stern half planked in primer and
    a top strake in the yard's blue, on keel blocks and side shores."""
    saved = B.HULL
    H = dict(saved)
    H.update({"length": length, "halfBeam": 1.40, "sheerMid": 1.0, "sheerRise": 0.55, "keel": 0.0, "keelRise": 0.40, "rake": 0.40})
    B.HULL = H
    try:
        off = Vector((cx, cy, z_deck + block))
        P = lambda x, y, z: off + Vector((x, y, z))
        # keel and stem
        n_st = 12
        us = [i / n_st for i in range(n_st + 1)]
        kp = [P(0, B.Y(u), B.bottom(u)) for u in us]
        for a, b in zip(kp, kp[1:]):
            box(m, (a + b) / 2, (0.18, (b - a).length + 0.02, 0.16), W["deep"], rot=Matrix.Rotation(math.atan2(b.z - a.z, b.y - a.y), 3, "X"))
        stem = [P(0, B.Y(1.0, z), z) for z in [B.bottom(1.0) + (B.top(1.0) - B.bottom(1.0)) * f for f in (0, 0.33, 0.66, 1.0)]]
        for a, b in zip(stem, stem[1:]):
            cyl(m, a, b, 0.09, 0.09, W["deep"], n=4)
        cyl(m, P(0, B.Y(0), B.bottom(0)), P(0, B.Y(0) - 0.05, B.top(0)), 0.09, 0.09, W["deep"], n=4)
        # transom board
        xt = B.x_at(0.0, B.top(0.0))
        box(m, P(0, B.Y(0), (B.bottom(0) + B.top(0)) / 2 + 0.1), (xt * 1.7, 0.08, (B.top(0) - B.bottom(0)) * 0.75), W["mid"])
        # ribs (frames): a square bar round each section, bare toward the bow
        ns = 5
        for i, u in enumerate([0.06 + 0.86 * i / 10 for i in range(11)]):
            pts = [B.sec(u, s / ns) for s in range(ns + 1)]
            for side in (1, -1):
                ps = [P(side * x, B.Y(u), z) for x, z in pts]
                for a, b in zip(ps, ps[1:]):
                    cyl(m, a, b, 0.05, 0.05, W["light"], n=4, caps=False)
            if i % 3 == 1:  # a few beams across the top
                box(m, P(0, B.Y(u), B.top(u) - 0.02), (2 * B.x_at(u, B.top(u)), 0.10, 0.08), W["mid"])
        # planking: from the stern forward, up to a ragged line that falls toward the bow
        su = [i / 14 * PLANKED for i in range(15)]
        rows = 6
        for side in (1, -1):
            grid = []
            for u in su:
                f = u / PLANKED
                upto = 0.92 - 0.55 * f ** 1.5
                grid.append([P(side * x * 1.03, B.Y(u), z) for x, z in (B.sec(u, upto * r / rows) for r in range(rows + 1))])
            vg = [[m.v(p) for p in row] for row in grid]
            for i in range(len(su) - 1):
                for r in range(rows):
                    q = (vg[i][r], vg[i + 1][r], vg[i + 1][r + 1], vg[i][r + 1])
                    if side < 0:
                        q = tuple(reversed(q))
                    col = PAL["hull"]["waterline"] if r < 2 else (PRIMER if r < rows - 1 else PAL["paint"]["cream"])
                    m.face(q, col, smooth=False)
                    m.face(tuple(reversed(q)), W["mid"], smooth=False)  # the inside of the planks
        floor = -block  # the deck, in the hull's local z
        for u in (0.1, 0.32, 0.55, 0.78):
            y = B.Y(u)
            zb = B.bottom(u) - 0.08
            box(m, P(0, y, (zb + floor) / 2), (0.9, 0.42, zb - floor), W["dark"])
            box(m, P(0, y, zb + 0.04), (0.7, 0.34, 0.08), W["mid"])
        for u in (0.18, 0.45, 0.72):
            for side in (1, -1):
                xs, zs = B.sec(u, 0.55)
                a = P(side * xs * 1.03, B.Y(u), zs)
                b = P(side * (xs + 1.0), B.Y(u), floor + 0.06)
                cyl(m, a, b, 0.06, 0.06, W["mid"], n=4)
                box(m, b, (0.3, 0.3, 0.06), W["dark"])
    finally:
        B.HULL = saved


def shed(m, x0, x1, y0, y1, hw, z):
    """A plank workshop with a red gable roof (ridge along X), a big open door to the slip side
    (+X) and a door and window to the sea side (+Y)."""
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    wall = C["wall"]
    # walls: vertical boards (two tones), leaving the big door on the +X end
    for k, (a, b) in enumerate((((x0, y0), (x1, y0)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0)))):
        pa, pb = Vector((*a, 0)), Vector((*b, 0))
        d = pb - pa
        n = max(2, int(d.length / 0.9))
        for i in range(n):
            p = pa + d * ((i + 0.5) / n)
            ang = math.atan2(d.y, d.x)
            box(m, (p.x, p.y, z + hw / 2), (d.length / n - 0.03, 0.12, hw), wall if i % 2 else PAL["paint"]["cream"], rot=Matrix.Rotation(ang, 3, "Z"))
    # +X end: two short wall pieces and a dark open doorway, with a lintel
    dw = 1.6
    for s in (1, -1):
        yy = cy + s * ((y1 - y0) / 2 - ((y1 - y0) / 2 - dw) / 2)
        box(m, (x1, yy, z + hw / 2), (0.12, (y1 - y0) / 2 - dw, hw), wall)
    box(m, (x1, cy, z + hw - 0.25), (0.14, 2 * dw, 0.5), wall)
    box(m, (x1 - 0.2, cy, z + (hw - 0.5) / 2), (0.05, 2 * dw, hw - 0.5), W["deep"])
    for s in (1, -1):  # open door leaves
        box(m, (x1 + 0.75, cy + s * (dw + 0.02), z + (hw - 0.55) / 2 + 0.02), (1.5, 0.08, hw - 0.55), W["mid"], rot=Matrix.Rotation(s * -0.25, 3, "Z"))
    # corner posts and a sill beam
    for x in (x0, x1):
        for y in (y0, y1):
            box(m, (x, y, z + hw / 2), (0.22, 0.22, hw + 0.02), W["dark"])
    for y in (y0, y1):
        box(m, (cx, y, z + hw), (x1 - x0 + 0.2, 0.2, 0.16), W["dark"])
    # sea side (+Y): door and two windows
    box(m, (cx + 1.2, y1 + 0.07, z + 0.95), (0.9, 0.04, 1.9), C["door"])
    quadbox(m, (cx + 1.5, y1 + 0.11, z + 0.95), (0.07, 0.07, 0.07), C["knob"])
    for wx in (cx - 0.6, cx - 2.2):
        box(m, (wx, y1 + 0.07, z + 1.6), (1.0, 0.05, 0.8), C["frame"])
        box(m, (wx, y1 + 0.10, z + 1.6), (0.84, 0.04, 0.64), C["glass"])
        box(m, (wx, y1 + 0.13, z + 1.6), (0.06, 0.03, 0.64), C["frame"])
    # gable roof
    over = 0.55
    rh = 1.7
    zr = z + hw
    ridge = zr + rh
    hx = (x1 - x0) / 2 + over
    hy = (y1 - y0) / 2 + over
    for s in (1, -1):
        a = Vector((cx - hx, cy + s * hy, zr - 0.25))
        b = Vector((cx + hx, cy + s * hy, zr - 0.25))
        c_ = Vector((cx + hx, cy, ridge))
        d = Vector((cx - hx, cy, ridge))
        # corrugated look: bands of two reds
        n = 8
        for i in range(n):
            pa, pb = a.lerp(b, i / n), a.lerp(b, (i + 1) / n)
            pd, pc = d.lerp(c_, i / n), d.lerp(c_, (i + 1) / n)
            q = (pa, pb, pc, pd) if s > 0 else (pb, pa, pd, pc)
            m.face(tuple(m.v(p) for p in q), ROOF if i % 2 == 0 else ROOF_DARK)
            # underside
            qn = tuple(reversed(q))
            m.face(tuple(m.v(p - Vector((0, 0, 0.08))) for p in qn), W["dark"])
        # eave board
        cyl(m, a + Vector((0, 0, -0.04)), b + Vector((0, 0, -0.04)), 0.07, 0.07, W["trim"], n=4)
    cyl(m, Vector((cx - hx - 0.05, cy, ridge + 0.02)), Vector((cx + hx + 0.05, cy, ridge + 0.02)), 0.12, 0.12, W["trim"], n=4)
    # gable ends (triangles) in wood
    for gx, s in ((x0, -1), (x1, 1)):
        pts = [Vector((gx, cy - (y1 - y0) / 2, zr)), Vector((gx, cy + (y1 - y0) / 2, zr)), Vector((gx, cy, ridge - 0.08))]
        if s < 0:
            pts = list(reversed(pts))
        m.face(tuple(m.v(p) for p in pts), W["light"])
        m.face(tuple(m.v(p - Vector((s * 0.12, 0, 0))) for p in reversed(pts)), W["light"])
    return ridge


def sign(m, c, facing_y=1):
    """A wooden board on two posts with a blue boat (hull, cabin, mast and a white sail)."""
    c = Vector(c)
    wdt, hgt = 3.0, 1.35
    for sx in (-1, 1):
        cyl(m, c + Vector((sx * 1.1, 0, -1.0)), c + Vector((sx * 1.1, 0, hgt / 2 + 0.15)), 0.07, 0.07, W["dark"], n=5)
    box(m, c, (wdt + 0.2, 0.14, hgt + 0.2), W["trim"])
    box(m, c + Vector((0, 0.04, 0)), (wdt, 0.12, hgt), PAL["paint"]["creamWarm"])
    fy = c.y + 0.11
    # hull silhouette (a trapezoid with a raised bow) in blue, a cream stripe, a red cabin, a mast
    hull = [(-1.05, -0.32), (0.75, -0.32), (1.2, 0.02), (-1.2, 0.02)]
    m.face(tuple(m.v((c.x + x, fy, c.z + z)) for x, z in hull), PAL["hut"]["rowboat"])
    m.face(tuple(m.v((c.x + x, fy + 0.005, c.z + z)) for x, z in [(-1.12, -0.06), (1.12, -0.06), (1.16, -0.02), (-1.16, -0.02)]), PAL["paint"]["white"])
    m.face(tuple(m.v((c.x + x, fy, c.z + z)) for x, z in [(-0.75, 0.02), (-0.15, 0.02), (-0.15, 0.30), (-0.70, 0.30)]), PAL["paint"]["red"])
    m.face(tuple(m.v((c.x + x, fy, c.z + z)) for x, z in [(0.10, 0.02), (0.16, 0.02), (0.16, 0.58), (0.10, 0.58)]), W["deep"])
    m.face(tuple(m.v((c.x + x, fy, c.z + z)) for x, z in [(0.20, 0.08), (0.90, 0.08), (0.20, 0.56)]), PAL["paint"]["white"])
    # waves
    for k in range(4):
        x = -1.1 + k * 0.62
        m.face(tuple(m.v((c.x + xx, fy, c.z + zz)) for xx, zz in [(x, -0.48), (x + 0.5, -0.48), (x + 0.5, -0.42), (x + 0.25, -0.36), (x, -0.42)]), PAL["fit"]["glass"])


def crane(m, x, y, z, h, reach, target):
    """A jib crane: a wooden post on a footing, a yellow jib and tie to the top, a winch drum,
    a rope with a block and hook over `target`."""
    yellow = PAL["fit"]["winch"]
    box(m, (x, y, z + 0.2), (1.0, 1.0, 0.4), W["dark"])
    cyl(m, (x, y, z + 0.4), (x, y, z + h), 0.2, 0.16, W["mid"], n=8)
    cyl(m, (x, y, z + h), (x, y, z + h + 0.12), 0.24, 0.24, C["steel"], n=8)
    t = Vector(target)
    d = Vector((t.x - x, t.y - y, 0)).normalized()
    foot = Vector((x, y, z + h * 0.45)) + d * 0.2
    tip = Vector((x, y, z + h + 0.6)) + d * reach
    cyl(m, foot, tip, 0.13, 0.10, yellow, n=6)
    for s in (0.32, 0.58, 0.82):  # lattice braces under the jib
        p = foot.lerp(tip, s)
        q = Vector((x, y, p.z - 0.6 * s)) + d * 0.18
        cyl(m, p, Vector((x, y, z + h * (0.45 + 0.45 * s))), 0.04, 0.04, yellow, n=4, caps=False)
    cyl(m, Vector((x, y, z + h + 0.1)), tip, 0.03, 0.03, C["steel"], n=4, caps=False)  # tie
    # counter jib with a weight
    back = Vector((x, y, z + h - 0.1)) - d * 1.4
    cyl(m, Vector((x, y, z + h - 0.1)), back, 0.09, 0.09, yellow, n=6)
    box(m, back - Vector((0, 0, 0.35)), (0.6, 0.6, 0.6), C["steel"])
    # winch drum on the post
    side = Vector((-d.y, d.x, 0))
    wc = Vector((x, y, z + 1.1)) + side * 0.35
    cyl(m, wc - side * 0.18, wc + side * 0.18, 0.18, 0.18, yellow, n=8)
    cyl(m, wc - side * 0.10, wc + side * 0.10, 0.20, 0.20, C["rope"], n=8, caps=False)
    # rope, block and hook
    hook_top = tip - Vector((0, 0, 0.05))
    drop = hook_top.z - (t.z + 0.9)
    cyl(m, hook_top, hook_top - Vector((0, 0, drop)), 0.025, 0.025, C["rope"], n=4, caps=False)
    end = hook_top - Vector((0, 0, drop))
    box(m, end - Vector((0, 0, 0.14)), (0.18, 0.12, 0.28), yellow)
    torus(m, end - Vector((0, 0, 0.42)), (side.x, side.y, 0), 0.11, 0.03, C["steel"], n1=8, n2=4)
    # a plank bundle on slings hanging from the hook
    bt = end - Vector((0, 0, 0.62))
    cyl(m, end - Vector((0, 0, 0.5)), bt + side * 0.0 + d * 0.6 + Vector((0, 0, -0.05)), 0.015, 0.015, C["rope"], n=3, caps=False)
    cyl(m, end - Vector((0, 0, 0.5)), bt - d * 0.6 + Vector((0, 0, -0.05)), 0.015, 0.015, C["rope"], n=3, caps=False)
    for k in (-1, 0, 1):
        box(m, bt - Vector((0, 0, 0.12)) + side * (k * 0.13), (abs(d.x) * 1.8 + 0.12, abs(d.y) * 1.8 + 0.12, 0.08), W["light"])


def lumber(m, x, y, z, n=4, L=3.0):
    for lvl in range(3):
        for i in range(n - lvl):
            box(m, (x, y + (i - (n - lvl - 1) / 2) * 0.26, z + 0.06 + lvl * 0.12), (L - lvl * 0.2, 0.24, 0.11), W["light"] if (i + lvl) % 2 else W["trim"])
    for sx in (-1, 1):
        box(m, (x + sx * (L / 2 - 0.3), y, z + 0.02), (0.12, n * 0.3, 0.06), W["dark"])


def sawhorse(m, x, y, z):
    for sy in (-0.6, 0.6):
        for sx in (-1, 1):
            cyl(m, (x + sx * 0.25, y + sy, z), (x, y + sy, z + 0.7), 0.04, 0.04, W["dark"], n=4)
    box(m, (x, y, z + 0.72), (0.12, 1.5, 0.08), W["mid"])
    box(m, (x + 0.15, y, z + 0.82), (0.3, 2.2, 0.06), W["light"])


YARD_PARTS = ("pier", "slipway", "hull", "workshop", "crane", "props")


def build_yard(col):
    """The yard as a root empty `shipyard` with one mesh per part (YARD_PARTS), all origins at the
    root (the water at the middle of the pier). Returns (root, {part: triangles, "total": n})."""
    Y_ = YARD
    pier, slip, hullm, work, cran, props = (B.Mesh(f"shipyard-{n}") for n in YARD_PARTS)
    z = Y_["deck"]
    px0, px1, py0, py1 = Y_["platform"]
    sx0, sx1, sy_end, sz_end = Y_["slip"]
    # platform floor (planks along X), split round the slipway's flat part
    m = pier
    plank_floor(m, px0, sx0 - 0.4, py0, py1, z, along="y", seed=1)
    plank_floor(m, sx1 + 0.4, px1, py0, py1, z, along="y", seed=2)
    plank_floor(m, sx0 - 0.4, sx1 + 0.4, py0, py0 + 1.6, z, along="y", seed=3)
    # stone-ish hard standing under the hull (darker boards across)
    plank_floor(m, sx0 - 0.4, sx1 + 0.4, py0 + 1.6, py1, z - 0.02, along="x", width=0.5, seed=4)
    # edge beams
    for y in (py0, py1):
        box(m, ((px0 + px1) / 2, y, z - 0.2), (px1 - px0, 0.2, 0.25), W["dark"])
    # piles
    for y in (py0 + 0.2, (py0 + py1) / 2, py1 - 0.1):
        for x in [px0 + 0.3 + i * (px1 - px0 - 0.6) / 6 for i in range(7)]:
            pile(m, x, y, z - 0.1, r=0.18, rope=(y == py1 - 0.1))
    # slipway: two rails and sleepers from the platform edge down into the sea
    m = slip
    sl_len = math.hypot(sy_end - py1, z - sz_end)
    ang = math.atan2(z - sz_end, sy_end - py1)
    Rx = Matrix.Rotation(-ang, 3, "X")
    mid = Vector(((sx0 + sx1) / 2, (py1 + sy_end) / 2, (z + sz_end) / 2))
    for k in range(9):
        f = (k + 0.5) / 9
        p = Vector(((sx0 + sx1) / 2, lerp(py1, sy_end, f), lerp(z, sz_end, f) - 0.14))
        box(m, p, (sx1 - sx0 + 0.4, 0.28, 0.14), W["dark"], rot=Rx)
    for rx in (sx0 + 1.0, sx1 - 1.0):
        box(m, Vector((rx, mid.y, mid.z - 0.02)), (0.22, sl_len, 0.14), W["trim"], rot=Rx)
        box(m, Vector((rx, (py0 + 1.6 + py1) / 2, z + 0.05)), (0.22, py1 - py0 - 1.6, 0.12), W["trim"])
    for f in (0.3, 0.8):
        for rx in (sx0, sx1):
            pile(m, rx, lerp(py1, sy_end, f), lerp(z, sz_end, f) - 0.15, r=0.16, rope=False)
    # jetty finger with bollards and a moored dinghy
    m = pier
    jx0, jx1, jy1 = Y_["jetty"]
    plank_floor(m, jx0, jx1, py1, jy1, z, along="x", width=0.45, seed=5)
    for y in (py1 + 1.5, jy1 - 0.15):
        for x in (jx0 + 0.1, jx1 - 0.1):
            pile(m, x, y, z - 0.1, r=0.18)
    for y in (py1 + 1.8, jy1 - 0.6):
        cyl(m, (jx1 - 0.25, y, z), (jx1 - 0.25, y, z + 0.35), 0.12, 0.12, C["steel"], n=6)
        cyl(m, (jx1 - 0.25, y, z + 0.35), (jx1 - 0.25, y, z + 0.42), 0.17, 0.17, C["steel"], n=6)
    dinghy(m, Vector((jx1 + 1.0, (py1 + jy1) / 2 + 0.6, 0.18)), L=2.6, W=1.1, Hh=0.38, col=PAL["paint"]["coral"])
    cyl(m, (jx1 - 0.25, py1 + 1.8, z + 0.3), (jx1 + 0.75, (py1 + jy1) / 2 - 0.5, 0.25), 0.02, 0.02, C["rope"], n=3, caps=False)
    # shed and sign
    hx0, hx1, hy0, hy1, hh = Y_["shed"]
    shed(work, hx0, hx1, hy0, hy1, hh, z)
    sign(work, Vector(((hx0 + hx1) / 2 - 0.4, hy1 + 0.75, z + hh + 1.25)))
    # the hull on the stocks, the crane over it
    hcx, hcy, hl = Y_["hull"]
    frame_hull(hullm, hcx, hcy, z, hl)
    cxp, cyp, ch, creach = Y_["crane"]
    crane(cran, cxp, cyp, z, ch, creach, (hcx, hcy - 0.6, z + 1.8))
    # yard props
    m = props
    for i, (bx, by) in enumerate(((-1.4, -5.2), (-0.75, -5.35), (-1.1, -4.6), (8.8, 0.6), (9.3, 0.0))):
        barrel(m, bx, by, z, col=PAL["fit"]["barrel"] if i % 3 else PAL["paint"]["red"])
    barrel(m, 9.0, -0.6, z + 0.0, r=0.3, h=0.8)
    coil(m, 8.2, 1.0, z)
    coil(m, -6.6, 0.6, z, r=0.3)
    lumber(m, 8.3, -4.6, z, n=5, L=3.2)
    sawhorse(m, -1.2, -2.8, z)
    for cx_, cy_, lvl in ((-6.4, -0.6, 0), (-5.8, -0.6, 0), (-6.1, -0.6, 1)):
        box(m, (cx_, cy_, z + 0.22 + lvl * 0.44), (0.55, 0.55, 0.44), C["crate"])
        box(m, (cx_, cy_, z + 0.44 + lvl * 0.44), (0.58, 0.58, 0.05), C["crateLid"])
    lamp_post(pier, px1 - 0.5, py1 - 0.4, z)
    lamp_post(pier, jx1 + 0.2, jy1 - 0.3, z)
    # a life ring on a post at the jetty, an anchor leaning on the shed
    cyl(pier, (jx0 + 0.2, py1 + 0.6, z), (jx0 + 0.2, py1 + 0.6, z + 1.4), 0.06, 0.06, W["dark"], n=5)
    torus(pier, (jx0 + 0.2, py1 + 0.69, z + 1.05), (0, 1, 0), 0.3, 0.08, lambda i: C["ringRed"] if (i // 3) % 2 == 0 else C["ringWhite"], n1=12, n2=6)
    an = Vector((hx1 - 1.3, hy1 + 0.45, z + 0.9))
    cyl(work, an - Vector((0, 0, 0.85)), an + Vector((0, -0.25, 0.5)), 0.05, 0.05, X["anchor"], n=5)
    cyl(work, an + Vector((-0.35, -0.2, 0.3)), an + Vector((0.35, -0.2, 0.3)), 0.04, 0.04, X["anchor"], n=4)
    for k in (-1, 1):
        cyl(work, an - Vector((0, 0, 0.85)), an + Vector((k * 0.45, 0.05, -0.45)), 0.05, 0.05, X["anchor"], n=4)
    root = bpy.data.objects.new("shipyard", None)
    col.objects.link(root)
    tris = {}
    for name, mesh in zip(YARD_PARTS, (pier, slip, hullm, work, cran, props)):
        tris[name] = mesh.triangles()
        o = mesh.object(col, (0, 0, 0))
        o.name = f"shipyard-{name}"
        o.data.name = o.name
        o.parent = root
    tris["total"] = sum(tris.values())
    return root, tris


# ------------------------------------------------------------------------------------------------
# Scenes and renders
# ------------------------------------------------------------------------------------------------
def _clear_scene(scene):
    for o in list(scene.collection.all_objects):
        me = o.data if o.type == "MESH" and o.data.users == 1 else None
        bpy.data.objects.remove(o, do_unlink=True)
        if me is not None:
            bpy.data.meshes.remove(me)


def _setup(scene, col_name, water=True):
    _clear_scene(scene)
    col = bpy.data.collections.get(col_name) or bpy.data.collections.new(col_name)
    if col.name not in [c.name for c in scene.collection.children]:
        scene.collection.children.link(col)
    if water:
        me = bpy.data.meshes.new(f"{col_name}-water")
        bm = bmesh.new()
        bmesh.ops.create_circle(bm, cap_ends=True, radius=300, segments=48)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(f"{col_name}-water", me)
        ob.data.materials.append(B.colour_mat(C["water"]))
        scene.collection.objects.link(ob)
    world = bpy.data.worlds.get("upgrade-world") or bpy.data.worlds.new("upgrade-world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.78, 0.86, 0.94, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    scene.world = world
    for name, energy, colr, rot in ((f"{col_name}-key", 3.2, (1.0, 0.95, 0.88), (50, 0, 35)),
                                    (f"{col_name}-fill", 1.0, (0.85, 0.9, 1.0), (62, 0, 200))):
        ld = bpy.data.lights.get(name) or bpy.data.lights.new(name, "SUN")
        ld.energy = energy
        ld.color = colr
        ld.angle = math.radians(8)
        lo = bpy.data.objects.new(name, ld)
        lo.rotation_euler = tuple(math.radians(a) for a in rot)
        scene.collection.objects.link(lo)
    cd = bpy.data.cameras.get(f"{col_name}-cam") or bpy.data.cameras.new(f"{col_name}-cam")
    cam = bpy.data.objects.new(f"{col_name}-cam", cd)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = "BLENDER_EEVEE"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    try:
        scene.eevee.taa_render_samples = 32
    except AttributeError:
        pass
    return col


def build_boats_scene(scene_name="UpgradeBoats"):
    """A NEW scene with tiers 1-4 side by side at true scale (bows +Y). Returns {tier: triangles}."""
    scene = bpy.data.scenes.get(scene_name) or bpy.data.scenes.new(scene_name)
    col = _setup(scene, "upgrade-boats")
    out = {}
    for t in (1, 2, 3, 4):
        root, tris = BUILDERS[t](col)
        root.location = (LINEUP_X[t], 0, 0)
        out[t] = tris
    return out


def build_shipyard_scene(scene_name="Shipyard"):
    scene = bpy.data.scenes.get(scene_name) or bpy.data.scenes.new(scene_name)
    col = _setup(scene, "shipyard")
    root, tris = build_yard(col)
    return {"shipyard": tris}


def aim(scene, eye, target, lens=50, res=(1600, 900), ortho=None):
    cam = scene.camera
    cam.data.type = "ORTHO" if ortho else "PERSP"
    if ortho:
        cam.data.ortho_scale = ortho
    cam.data.lens = lens
    eye, target = Vector(eye), Vector(target)
    cam.location = eye
    cam.rotation_euler = (target - eye).to_track_quat("-Z", "Y").to_euler()
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100


def render(scene_name, path):
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


def _only(scene, tier):
    """Show one tier (or all with None) in renders."""
    for t in (1, 2, 3, 4):
        r = scene.objects.get(f"boat-t{t}")
        if r is None:
            continue
        for o in [r] + list(r.children):
            o.hide_render = tier is not None and t != tier


def render_boats(out_dir, scene_name="UpgradeBoats"):
    scene = bpy.data.scenes[scene_name]
    os.makedirs(out_dir, exist_ok=True)
    done = []
    for t in (2, 3, 4):
        _only(scene, t)
        x = LINEUP_X[t]
        L = TIERS[t]["hull"]["length"]
        k = L / 7.4
        aim(scene, (x + 8.5 * k, 11.5 * k, 5.2 * k), (x, 0.0, 1.4 * k), lens=50)
        done.append(render(scene_name, os.path.join(out_dir, f"boat-t{t}-three-quarter.png")))
        aim(scene, (x + 30.0 * k, 0.0, 1.6), (x, 0.0, 1.5 * k), lens=85, res=(1600, 800))
        done.append(render(scene_name, os.path.join(out_dir, f"boat-t{t}-side.png")))
        # the game's chase camera (babylon-scene.ts: 17.5 m behind, 9.6 m up, fov 0.9 vertical)
        cam = scene.camera
        cam.data.sensor_fit = "VERTICAL"
        cam.data.angle_y = 0.9
        cam.location = (x, -17.5, 9.6)
        cam.rotation_euler = (Vector((x, 34.0, 2.2)) - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.resolution_x, scene.render.resolution_y = 1688, 780
        done.append(render(scene_name, os.path.join(out_dir, f"boat-t{t}-chase.png")))
        cam.data.sensor_fit = "AUTO"
    _only(scene, None)
    cx = (LINEUP_X[1] + LINEUP_X[4]) / 2
    # orthographic, so the four boats are compared at true scale (no perspective)
    aim(scene, (cx + 18.0, 40.0, 20.0), (cx + 0.5, 0.0, 2.2), res=(2000, 900), ortho=33.0)
    done.append(render(scene_name, os.path.join(out_dir, "boats-lineup.png")))
    aim(scene, (cx - 14.0, -40.0, 20.0), (cx + 0.5, 0.0, 2.2), res=(2000, 900), ortho=33.0)
    done.append(render(scene_name, os.path.join(out_dir, "boats-lineup-rear.png")))
    # side by side, seen from the side: the boats are moved into a row along Y for this shot only
    for t in (1, 2, 3, 4):
        scene.objects[f"boat-t{t}"].location = (0, SIDE_Y[t], 0)
    aim(scene, (80.0, 2.0, 6.0), (0.0, 2.0, 2.0), res=(2400, 700), ortho=46.0)
    done.append(render(scene_name, os.path.join(out_dir, "boats-lineup-side.png")))
    for t in (1, 2, 3, 4):
        scene.objects[f"boat-t{t}"].location = (LINEUP_X[t], 0, 0)
    return done


def render_shipyard(out_dir, scene_name="Shipyard"):
    scene = bpy.data.scenes[scene_name]
    os.makedirs(out_dir, exist_ok=True)
    done = []
    aim(scene, (17.0, 25.0, 11.0), (0.0, 0.0, 1.8), lens=32, res=(1800, 1000))
    done.append(render(scene_name, os.path.join(out_dir, "shipyard-sea-side.png")))
    aim(scene, (-21.0, 15.0, 15.0), (0.0, -0.5, 1.2), lens=30, res=(1800, 1000))
    done.append(render(scene_name, os.path.join(out_dir, "shipyard-high.png")))
    aim(scene, (13.0, 11.0, 4.5), (2.6, -2.0, 1.8), lens=30, res=(1800, 1000))
    done.append(render(scene_name, os.path.join(out_dir, "shipyard-slipway.png")))
    return done


def render_all(out_dir):
    return render_boats(out_dir) + render_shipyard(out_dir)


# ------------------------------------------------------------------------------------------------
# GLB export (boat.export_parts_glb does the work: copies, 180-degree turn, baked colours)
# ------------------------------------------------------------------------------------------------
def tier_parts(scene, tier):
    """{glb node: object or [objects]} of a tier in the UpgradeBoats scene. The six names are
    boat-paint.ts's BOAT_PARTS; tier 2's two outboards (`engine-1`, `engine-2`) become ONE `engine`."""
    parts = {}
    for node in B.GLB_NODES:
        if node == "engine" and f"t{tier}-engine" not in scene.objects:
            parts[node] = [scene.objects[f"t{tier}-engine-{i}"] for i in (1, 2)]
        else:
            parts[node] = scene.objects[f"t{tier}-{node}"]
    return parts


def export_boat(path, tier, scene_name="UpgradeBoats"):
    """Write one boat tier (1 rebuilds boat.glb) as the root `boat` with the six parts."""
    scene = bpy.data.scenes[scene_name]
    return B.export_parts_glb(path, scene.objects[f"boat-t{tier}"], tier_parts(scene, tier), "boat")


def export_shipyard(path, scene_name="Shipyard"):
    """Write the yard: the root `shipyard` with one mesh per part (YARD_PARTS). The sea side is
    Blender +Y, turned like a boat's bow to glTF +Z."""
    scene = bpy.data.scenes[scene_name]
    parts = {n: scene.objects[f"shipyard-{n}"] for n in YARD_PARTS}
    return B.export_parts_glb(path, scene.objects["shipyard"], parts, "shipyard")


def export_all(out_dir):
    out = {}
    for t, name in ((1, "boat.glb"), (2, "boat-2.glb"), (3, "boat-3.glb"), (4, "boat-4.glb")):
        out[name] = export_boat(os.path.join(out_dir, name), t)
    out["shipyard.glb"] = export_shipyard(os.path.join(out_dir, "shipyard.glb"))
    return out


def render_flag_views(out_dir, scene_name="UpgradeBoats", tag="vn"):
    """New shots for the flag: the side line-up, close views of the flag on tiers 1 and 4 from
    starboard and port, and each tier at the game's chase distance (17.5 m behind, 9.6 m up) and
    from 17.5 m on the quarter."""
    scene = bpy.data.scenes[scene_name]
    os.makedirs(out_dir, exist_ok=True)
    done = []
    for t in (1, 2, 3, 4):
        scene.objects[f"boat-t{t}"].location = (0, SIDE_Y[t], 0)
    aim(scene, (80.0, 2.0, 6.0), (0.0, 2.0, 2.0), res=(2400, 700), ortho=46.0)
    done.append(render(scene_name, os.path.join(out_dir, f"boats-lineup-side-{tag}.png")))
    for t in (1, 2, 3, 4):
        scene.objects[f"boat-t{t}"].location = (LINEUP_X[t], 0, 0)
    for t in (1, 4):
        _only(scene, t)
        fl = scene.objects[f"t{t}-flag"]
        c = scene.objects[f"boat-t{t}"].location + fl.location + Vector((0, -0.42, -0.24))
        for side, name in ((1, "starboard"), (-1, "port")):
            aim(scene, c + Vector((side * 3.2, -0.6, 0.4)), c, lens=50, res=(1200, 800))
            done.append(render(scene_name, os.path.join(out_dir, f"flag-t{t}-{name}.png")))
        x = LINEUP_X[t]
        cam = scene.camera
        cam.data.type = "PERSP"
        cam.data.sensor_fit = "VERTICAL"
        cam.data.angle_y = 0.9
        cam.location = (x, -17.5, 9.6)
        cam.rotation_euler = (Vector((x, 34.0, 2.2)) - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.resolution_x, scene.render.resolution_y = 1688, 780
        done.append(render(scene_name, os.path.join(out_dir, f"flag-t{t}-chase.png")))
        cam.data.sensor_fit = "AUTO"
        eye = Vector((x + 12.4, -12.4, 6.0))
        aim(scene, eye, Vector((x, -0.5, 2.6)), lens=50, res=(1600, 900))
        done.append(render(scene_name, os.path.join(out_dir, f"flag-t{t}-quarter-17m.png")))
    _only(scene, None)
    return done
