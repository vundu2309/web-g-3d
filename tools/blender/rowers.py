"""Rowing cats for the sea game (STRUCTURE stage): two chibi cats sitting side by side on the thwart
of a small clinker rowing boat, each pulling one oar.

Same style as the market vendors (vendors.py, cat-*.glb): bmesh, one material per palette colour
(baked to vertex colours by lib.bake_colors on export), no textures, the vendors' head, ear, face and
tail helpers reused as they are. Blender axes: Z up, metres; the CATS face -Y (glTF +Z), the BOAT's
bow is +Y (glTF -Z): rowers face the stern. Never calls lib.reset(): it builds a NEW scene.

    import sys; sys.path[:0] = ["<scratchpad>", "<repo>/tools/blender"]
    import importlib, rowers; importlib.reload(rowers)
    rowers.build_scene("Rowers"); rowers.render("/tmp/rowers.png", "crew")

Objects (each one set to export on its own; the scene places them in the assembled crew layout):

    rower-<key>          empty at the seat point (the cat sits on z = 0)
      <key>-body         torso, neck, legs, feet       origin at the seat
      <key>-head         head, face, ears, whiskers    origin at the neck pivot
      <key>-tail         curled tail                   origin at its base
      <key>-arm.L / .R   upper arm                     origin at the shoulder
        <key>-fore.L/.R  forearm and paw (child)       origin at the elbow
    oar-starboard / oar-port   one mesh each, origin at the oarlock pivot, handle inboard
    rowboat              one mesh, origin at the waterline middle
    lantern-post / lantern-glass   bow lantern on a crook post (and its glass alone), in boat space
                         with the origin at the boat origin; export_lantern writes rower-lantern.glb

Tunable numbers: CREW (layout shared by the three), CAT (cat geometry), VARIANTS (colours and the
oar side), BOAT, OAR and LANTERN. Every colour is a palette role.
"""
import math, os
import bpy, bmesh
from mathutils import Matrix, Vector
import lib
import vendors as V
from vendors import Mesh, ellipsoid, sweep, sweep_rings, smooth_path, lathe, profile_at, oface, lerp, mix_hex

PAL = lib.PAL
FACE = V.FACE

# ------------------------------------------------------------------------------------------------
# Layout shared by the boat, the cats and the oars (Blender boat space, origin waterline middle)
# ------------------------------------------------------------------------------------------------
CREW = {
    "seat_x": 0.30,        # cats at x = +-0.30
    "seat_y": 0.22,        # thwart centre (Blender +Y = toward the bow; glTF z = -0.22)
    "thwart_top": 0.02,    # the cats sit on this height (glTF y)
    "floor": -0.22,        # floorboard top (the cats' feet)
    "oarlock_x": 0.72,
    "oarlock_y": -0.08,    # glTF z = +0.08
    "grip_inboard": (0.24, 0.36),  # where the outboard and inboard paws hold the handle, from the oarlock
}

# ------------------------------------------------------------------------------------------------
# Cat geometry (cat space: seat point at the origin, front -Y). Torso rows: (z, rx, ry, dy).
# ------------------------------------------------------------------------------------------------
CAT = {
    "torso": [(0.0, 0.135, 0.115, 0.0), (0.04, 0.168, 0.148, -0.006), (0.11, 0.175, 0.155, -0.016),
              (0.19, 0.166, 0.146, -0.016), (0.26, 0.148, 0.124, -0.008), (0.32, 0.124, 0.100, 0.0),
              (0.37, 0.088, 0.072, 0.0), (0.405, 0.045, 0.042, 0.0)],
    "torsoSides": 12, "legSides": 7,
    "neck": (0.38, 0.44, 0.058),
    # head built at c / r (vendor units) then scaled about the chin; chin = c.z - 0.92 r.z = 0.42
    "head": {"c": (0.0, -0.02, 0.42 + 0.92 * 0.104), "r": (0.130, 0.110, 0.104), "jaw": 0.92, "scale": 2.1,
             "muzzle": 1.1, "seg": 14, "rings": 9, "muzzleSeg": (6, 4)},
    "ears": {"x": 0.60, "h": 0.075, "w": 0.044, "splay": 0.40},
    "eyes": {"x": 0.050, "z": 0.004, "w": 0.017, "h": 0.021},
    "shoulder": (0.122, -0.004, 0.318),
    "upperR": (0.046, 0.040), "foreR": (0.040, 0.034), "armSides": 8,
    "polePull": (0.8, 0.0, -1.0),        # elbow direction of the outboard arm (x mirrored per side)
    "poleCross": (0.0, -0.7, -1.0),      # the arm reaching across the body: elbow forward and down
    "elbowBend": 1.07,      # arm length / straight shoulder-wrist distance (how bent the elbow is)
    "paw": 0.044,
    "hip": 0.085, "knee": (0.10, -0.25, 0.08), "ankle": (0.10, -0.29, -0.19), "legR": (0.066, 0.056, 0.046),
    "tail": [(0.0, 0.12, 0.05), (0.02, 0.23, 0.08), (0.05, 0.30, 0.18), (0.07, 0.29, 0.30),
             (0.07, 0.22, 0.36), (0.06, 0.17, 0.33)],
    "tailR": (0.034, 0.022), "tailSides": 5, "tailSteps": 2,
    "strokeStep": 0.014,    # face stripe resampling (smaller = smoother, more triangles)
    "whiskers": 2,          # per side
    "bellyAngle": 52,       # degrees around the front that are pale
    "backStripes": 3,
}

VARIANTS = {
    "ginger": {"fur": PAL["fit"]["winch"], "stripe": PAL["paint"]["redDeep"], "pale": PAL["paint"]["creamWarm"],
               "whisker": PAL["paint"]["creamWarm"], "oar": 1},     # rows the starboard oar (its left)
    "grey": {"fur": PAL["stone"]["rock"], "stripe": PAL["stone"]["dark"], "pale": PAL["paint"]["white"],
             "whisker": PAL["paint"]["white"], "oar": -1},          # rows the port oar
}
EYE, GLINT, PINK = FACE["eye"], FACE["glint"], FACE["pink"]


def grip_points(oar_side):
    """Cat-space (left paw, right paw) positions on the handle with the oar at rest (across the boat)."""
    o = oar_side
    lx = CREW["oarlock_x"] - CREW["seat_x"]
    y = CREW["oarlock_y"] - CREW["seat_y"]
    z = oarlock_pivot_z() - CREW["thwart_top"]
    out_d, in_d = CREW["grip_inboard"]
    pts = {}
    for s in (1, -1):
        d = out_d if s == o else in_d
        pts[s] = Vector((o * (lx - d), y, z))
    return pts


def paint_torso(m, faces, R):
    """Pale belly (faces whose centre lies within bellyAngle of the front) and tabby bands on the back."""
    lim = math.cos(math.radians(CAT["bellyAngle"]))
    prof = CAT["torso"]
    z0, z1 = 0.10, prof[-2][0]
    nb = CAT["backStripes"]
    for f in faces:
        c = f.calc_center_median()
        rx, ry, dy = profile_at(prof, c.z)
        u = Vector((c.x / rx, (c.y - dy) / ry, 0)).normalized()
        if u.dot(Vector((0, -1, 0))) > lim and c.z < prof[-2][0]:
            f.material_index = m.slot(R["pale"])
        elif u.y > 0.35 and z0 < c.z < z1:
            band = int((c.z - z0) / (z1 - z0) * (2 * nb))
            if band % 2 == 1:
                f.material_index = m.slot(R["stripe"])


def build_cat(col, key):
    R = VARIANTS[key]
    C = CAT
    # body: torso, neck, legs, feet -------------------------------------------------------------
    body = Mesh(f"{key}-body", smooth=True)
    before = set(body.bm.faces)
    lathe(body, C["torso"], R["fur"], sides=C["torsoSides"], cap0=True, cap1=False)
    paint_torso(body, [f for f in body.bm.faces if f not in before], R)
    n0, n1, nr = C["neck"]
    sweep(body, [(0, 0.0, n0), (0, -0.01, n1)], [nr * 1.15, nr], R["fur"], sides=10, caps=False)
    r0, r1, r2 = C["legR"]
    for s in (-1, 1):
        hip = Vector((s * C["hip"], -0.03, 0.075))
        kn = Vector(C["knee"]); kn.x *= s
        an = Vector(C["ankle"]); an.x *= s
        pts = smooth_path([hip, kn, an], steps=2)
        radii = [r0, lerp(r0, r1, 0.6), r1, lerp(r1, r2, 0.5), r2]
        sweep(body, pts, radii, R["fur"], sides=C["legSides"], caps=False)
        floor = CREW["floor"] - CREW["thwart_top"]
        fc = Vector((an.x, an.y - 0.04, floor + 0.028))
        ellipsoid(body, fc, (0.050, 0.080, 0.030), R["pale"], seg=8, rings=4)
    # head ----------------------------------------------------------------------------------------
    spec = {"head": C["head"]}
    head, f, c, r = cat_head(f"{key}-head", spec, R["fur"], R["pale"],
                               marks=[((0, -0.55, -0.85), 30, R["pale"])])
    for x in (-0.024, 0.0, 0.024):  # brow stripes on the forehead
        f.stroke([(x * 1.3, 0.088), (x, 0.044)], 0.0062, R["stripe"], lift=0.0015, step=C["strokeStep"])
    E = C["eyes"]
    for s in (-1, 1):
        for z0 in (0.008, -0.016):  # cheek stripes
            f.stroke(sorted([(s * 0.090, z0), (s * 0.108, z0 - 0.002), (s * 0.122, z0 - 0.006)]), 0.0048,
                     R["stripe"], lift=0.0015, step=C["strokeStep"])
        ex = s * E["x"]
        f.blob(ex, E["z"], E["w"], E["h"], EYE, lift=0.0022, dome=0.002, n=10)       # big dark eye
        f.blob(ex + s * 0.005, E["z"] + 0.008, 0.0050, 0.0050, GLINT, lift=0.0048, n=6)
        f.blob(ex - s * 0.005, E["z"] - 0.008, 0.0024, 0.0024, GLINT, lift=0.0048, n=5)
        f.stroke(sorted([(s * 0.034, E["z"] + 0.034), (s * 0.050, E["z"] + 0.039), (s * 0.066, E["z"] + 0.032)]),
                 0.0040, R["stripe"], lift=0.002, step=C["strokeStep"])                                      # brow line
        V.blush(f, s, 0.080, -0.030, R["fur"], 0.35)
    V.cat_mouth(f, FACE["mouth"], mix_hex(PINK, FACE["mouth"], 0.3))
    whiskers(head, f, R["whisker"], C["whiskers"])
    for s in (-1, 1):
        V.ear(head, c, r, s, C["ears"], R["fur"], PINK)
    V.grow_head(spec, head)
    # tail ----------------------------------------------------------------------------------------
    tl = tail(f"{key}-tail", C, lambda t: R["stripe"] if (int(t * 7) % 2 == 1 and t < 0.9) else
                (R["pale"] if t >= 0.9 else R["fur"]))
    # arms ----------------------------------------------------------------------------------------
    grips = grip_points(R["oar"])
    arms = {}
    for s in (1, -1):
        arms[s] = build_arm(key, s, grips[s], R)
    return finish(col, key, body, head, tl, arms, c)


def cat_head(name, spec, fur, muzzle, marks=()):
    """vendors.cat_head with the muzzle's sphere density as a parameter (head.muzzleSeg)."""
    hs = spec["head"]
    m = Mesh(name, smooth=True)
    c = Vector(hs["c"])
    rx, ry, rz = hs["r"]
    ellipsoid(m, c, (rx, ry, rz), fur, seg=hs["seg"], rings=hs["rings"], jaw=hs["jaw"])
    for d, ang, hexint in marks:
        d = Vector(d).normalized()
        lim = math.cos(math.radians(ang))
        for fc in m.bm.faces:
            q = fc.calc_center_median() - c
            if Vector((q.x / rx, q.y / ry, q.z / rz)).normalized().dot(d) > lim:
                fc.material_index = m.slot(hexint)
    k = hs.get("muzzle", 1.0)
    sg, rg = hs.get("muzzleSeg", (8, 5))
    for s in (-1, 1):
        ellipsoid(m, c + Vector((s * 0.021 * k, -ry * 0.84, -rz * 0.36)), (0.027 * k, 0.022 * k, 0.022 * k),
                  muzzle, seg=sg, rings=rg)
    ellipsoid(m, c + Vector((0, -ry * 0.76, -rz * 0.62)), (0.020 * k, 0.016 * k, 0.013 * k), muzzle, seg=sg, rings=rg)
    return m, V.Face(m, c, (rx, ry, rz)), c, (rx, ry, rz)


def tail(name, C, colour_at):
    """A tapering tail along C['tail'] (base first), C['tailSides'] round, with a rounded tip."""
    m = Mesh(name, smooth=True)
    pts = smooth_path(C["tail"], C["tailSteps"])
    r0, r1 = C["tailR"]
    n = len(pts)
    radii = [lerp(r0, r1, i / (n - 1)) for i in range(n)]
    sweep(m, pts, radii, [colour_at(i / (n - 2)) for i in range(n - 1)], sides=C["tailSides"], caps=False)
    ellipsoid(m, pts[-1], (r1, r1, r1), colour_at(1.0), seg=C["tailSides"], rings=3)
    return m, Vector(C["tail"][0])


def whiskers(m, f, hexint, n):
    old = m.smooth
    m.smooth = False
    for s in (-1, 1):
        loc, nor = f.hit(s * 0.030, -0.034)
        if loc is None:
            continue
        for dz in ((0.006, -0.006) if n == 2 else (0.010, 0.0, -0.010))[:n]:
            root = loc - nor * 0.004
            end = loc + Vector((s * 0.056, 0.004, dz * 1.6))
            sweep(m, [root, end], [(0.0018, 0.0034), (0.0009, 0.0017)], hexint, sides=3,
                  axis=lambda p, t: Vector((0, 1, 0)))
    m.smooth = old


def build_arm(key, s, grip, R):
    """Upper arm (shoulder -> elbow) and forearm + paw (elbow -> the paw on the handle). The elbow is
    a two-bone solve with the pole outward and down, so code can re-solve it as the oar sweeps."""
    C = CAT
    S = Vector(C["shoulder"]); S.x *= s
    P = Vector(grip)
    W = P + Vector((0, 0.050, -0.006))                   # wrist just behind the paw
    L = (W - S).length
    seg = L * 0.5 * C["elbowBend"]
    axis = (W - S).normalized()
    crossing = P.x * s < 0 if abs(P.x) > 0.02 else False
    px, py, pz = C["poleCross"] if crossing else C["polePull"]
    pole = Vector((px if crossing else s * px, py, pz))
    pole = (pole - axis * pole.dot(axis)).normalized()
    E = (S + W) * 0.5 + pole * math.sqrt(max(0.0, seg * seg - (L * 0.5) ** 2))
    side = "L" if s > 0 else "R"
    up = Mesh(f"{key}-arm.{side}", smooth=True)
    sweep(up, [S, E], list(C["upperR"]), R["fur"], sides=C["armSides"], caps=False)
    ellipsoid(up, S, (C["upperR"][0],) * 3, R["fur"], seg=6, rings=4)
    ellipsoid(up, E, (C["upperR"][1],) * 3, R["fur"], seg=6, rings=4)
    fo = Mesh(f"{key}-fore.{side}", smooth=True)
    mid = E.lerp(W, 0.5)
    sweep(fo, [E, mid, W], [C["foreR"][0], lerp(C["foreR"][0], C["foreR"][1], 0.5), C["foreR"][1]],
          [R["stripe"], R["fur"]], sides=C["armSides"], caps=False)
    k = C["paw"]
    pc = P + Vector((0, 0.004, 0.010))                   # the paw wraps over the handle
    ellipsoid(fo, pc, (k * 0.95, k * 1.05, k * 0.90), R["pale"], seg=8, rings=4)
    for i in (-1, 0, 1):                                  # toes curled round the front of the handle
        ellipsoid(fo, pc + Vector((i * 0.024, -0.036, -0.016)), (0.014, 0.014, 0.016), R["pale"], seg=5, rings=3)
    return up, fo, S, E


def finish(col, key, body, head, tl, arms, head_c):
    root = bpy.data.objects.new(f"rower-{key}", None)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.2
    col.objects.link(root)
    tris = {"body": body.triangles(), "head": head.triangles(), "tail": tl[0].triangles()}
    ob = body.object(col)
    ob.parent = root
    neck = Vector((0, head_c.y, CAT["neck"][1] - 0.02))
    oh = head.object(col, origin=neck)
    oh.parent = root
    tm, tbase = tl
    otl = tm.object(col, origin=tbase)
    otl.parent = root
    for s, (up, fo, S, E) in arms.items():
        tris[up.name] = up.triangles()
        tris[fo.name] = fo.triangles()
        ou = up.object(col, origin=S)
        ou.parent = root
        of = fo.object(col, origin=E)
        of.parent = ou
        of.location = E - S
    tris["total"] = sum(tris.values())
    root["triangles"] = tris["total"]
    return root, tris


# ------------------------------------------------------------------------------------------------
# Boat: clinker hull (5 lapped strakes), transom stern, stem bow, thwart, seats, floorboards, oarlocks
# ------------------------------------------------------------------------------------------------
BOAT = {
    # length: the keel line; the raked stem adds BOAT["rake"] at the top
    "length": 3.55, "beam": 1.40, "transomHalf": 0.50, "widest": 0.479,   # t of the widest station
    "sheer": 0.30, "sheerBow": 0.20, "sheerStern": 0.08, "keel": -0.30, "keelBowRise": 0.26,
    "bilge": 0.92, "strakes": 5, "lap": 0.018, "lapShade": 0.45, "lapBand": 0.02, "rake": 0.28, "overlap": 0.025, "stations": 16, "thick": 0.022,
    "innerEnd": 0.90,       # t where the inside stops at a small foredeck
    "rail": (0.020, 0.024),  # gunwale rail half sizes (out, up)
    "colours": {
        "strakes": [PAL["hut"]["rowboat"]] * 4 + [PAL["paint"]["cream"]],   # top strake cream
        "inside": PAL["wood"]["light"], "rail": PAL["wood"]["dark"], "keel": PAL["wood"]["deep"],
        "seat": PAL["wood"]["mid"], "floor": PAL["wood"]["deck"][0], "transom": PAL["hut"]["rowboat"],
        "oarlock": PAL["metal"]["steel"], "deck": PAL["wood"]["mid"], "lapLine": PAL["wood"]["deep"],
    },
}


def half_breadth(t):
    B = BOAT
    bm, bs, tm = B["beam"] / 2, B["transomHalf"], B["widest"]
    if t <= tm:
        return bs + (bm - bs) * math.sin(math.pi / 2 * t / tm)
    u = (t - tm) / (1 - tm)
    return max(0.022, bm * max(0.0, 1 - u ** 1.9) ** 0.72)


def sheer(t):
    B = BOAT
    if t < 0.45:
        return B["sheer"] + B["sheerStern"] * ((0.45 - t) / 0.45) ** 2
    return B["sheer"] + B["sheerBow"] * ((t - 0.45) / 0.55) ** 2


def keel(t):
    B = BOAT
    if t < 0.4:
        return B["keel"] + 0.06 * ((0.4 - t) / 0.4) ** 2
    if t < 0.62:
        return B["keel"]
    return B["keel"] + B["keelBowRise"] * ((t - 0.62) / 0.38) ** 1.6


def station_y(t):
    return -BOAT["length"] / 2 + BOAT["length"] * t


def section(t, s):
    """Starboard section point (x, z) and outward normal at s in [0, 1] (keel -> gunwale)."""
    Bt, St, Kt = half_breadth(t), sheer(t), keel(t)
    bil = BOAT["bilge"] - 0.55 * max(0.0, (t - 0.55) / 0.45)
    p1 = (Bt * bil, Kt + (St - Kt) * 0.12)
    x = 2 * (1 - s) * s * p1[0] + s * s * Bt
    z = (1 - s) ** 2 * Kt + 2 * (1 - s) * s * p1[1] + s * s * St
    dx = 2 * (1 - 2 * s) * p1[0] + 2 * s * Bt
    dz = -2 * (1 - s) * Kt + 2 * (1 - 2 * s) * p1[1] + 2 * s * St
    n = Vector((dz, -dx))
    n = n.normalized() if n.length > 1e-9 else Vector((1, 0))
    return Vector((x, z)), n


def outer_side(t):
    """Starboard outer points from the keel up: keel, then per strake (lower edge lapped out, upper)."""
    B = BOAT
    k = B["strakes"]
    pts = [section(t, 0.0)[0]]
    cols = []
    for i in range(k):
        s0, s1 = i / k, (i + 1) / k
        if i > 0:
            line = mix_hex(B["colours"]["strakes"][i], B["colours"]["lapLine"], B["lapShade"])
            p, n = section(t, max(0.0, s0 - B["overlap"]))
            pts.append(p + n * B["lap"])
            cols.append(line)                            # the lap edge (faces down)
            p, n = section(t, s0 + B["lapBand"])
            pts.append(p + n * B["lap"] * 0.8)
            cols.append(line)                            # a thin dark band so the lap reads from the side
        pts.append(section(t, s1)[0])
        cols.append(B["colours"]["strakes"][i])
    return pts, cols


def inner_side(t, n=5):
    pts = []
    for j in range(n):
        p, nn = section(t, j / (n - 1))
        q = p - nn * BOAT["thick"]
        pts.append(Vector((max(0.0, q.x), q.y)))
    return pts


def hull_y(t, z):
    """Station y, pushed forward toward the top of the bow (a raked stem)."""
    w = max(0.0, (t - 0.78) / 0.22) ** 2
    h = max(0.0, min(1.2, (z - keel(t)) / max(1e-6, sheer(t) - keel(t))))
    return station_y(t) + BOAT["rake"] * w * h


def ring(side_pts, t):
    stb = [Vector((p.x, hull_y(t, p.y), p.y)) for p in side_pts]
    port = [Vector((-p.x, hull_y(t, p.y), p.y)) for p in reversed(side_pts[1:])]
    return port + stb


def oarlock_pivot_z():
    t = (CREW["oarlock_y"] + BOAT["length"] / 2) / BOAT["length"]
    return sheer(t) + BOAT["rail"][1] * 2 + 0.050


def inner_half_at(t, z):
    """Inside half breadth of the hull at height z (for sizing seats)."""
    best = 0.0
    for j in range(201):
        p, nn = section(t, j / 200)
        q = p - nn * BOAT["thick"]
        if q.y <= z:
            best = q.x
    return best


def box(m, c, size, hexint):
    c = Vector(c)
    hx, hy, hz = (v / 2 for v in size)
    vs = [m.v(c + Vector((x, y, z))) for z in (-hz, hz) for y in (-hy, hy) for x in (-hx, hx)]
    for q in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        oface(m, [vs[i] for i in q], hexint, c)


def build_boat(col):
    B, Cc = BOAT, BOAT["colours"]
    m = Mesh("rowboat", smooth=False)
    N = B["stations"]
    ts = [i / (N - 1) for i in range(N)]
    # outer clinker skin
    rings, cols = [], None
    for t in ts:
        side, cols = outer_side(t)
        rings.append([m.v(p) for p in ring(side, t)])
    band = list(reversed(cols)) + cols                 # one colour per quad across the ring
    for i in range(N - 1):
        a, b = rings[i], rings[i + 1]
        for j in range(len(a) - 1):
            m.face((a[j], b[j], b[j + 1], a[j + 1]), band[j])
    # transom (outer face)
    f = m.face(list(reversed(rings[0])), Cc["transom"])
    if f is not None:
        f.normal_update()
        if f.normal.y > 0:
            f.normal_flip()
    # inner skin, from just inside the transom to the foredeck bulkhead
    ti = [t for t in ts if t <= B["innerEnd"] + 1e-6]
    if ti[-1] < B["innerEnd"]:
        ti.append(B["innerEnd"])
    tin = 0.035 / B["length"]
    ti[0] = tin
    irings = [[m.v(p) for p in ring(inner_side(t), t)] for t in ti]
    for i in range(len(irings) - 1):
        a, b = irings[i], irings[i + 1]
        for j in range(len(a) - 1):
            m.face((a[j], a[j + 1], b[j + 1], b[j]), Cc["inside"])
    f = m.face(list(irings[0]), Cc["inside"])       # transom inside
    if f is not None:
        f.normal_update()
        if f.normal.y < 0:
            f.normal_flip()
    f = m.face(list(irings[-1]), Cc["deck"])         # bulkhead under the foredeck, facing aft
    if f is not None:
        f.normal_update()
        if f.normal.y > 0:
            f.normal_flip()
    # transom top
    o0, i0 = rings[0], irings[0]
    oface(m, (o0[0], o0[-1], i0[-1], i0[0]), Cc["rail"], Vector((0, station_y(0) + 0.02, sheer(0) - 1)))
    # foredeck: from the bulkhead to the stem at sheer height
    tf = [t for t in ts if t > B["innerEnd"]]
    dk = []
    for t in [B["innerEnd"]] + tf:
        x = half_breadth(t)
        dk.append((x, hull_y(t, sheer(t)), sheer(t) + 0.004))
    pts = [m.v((x, y, z)) for x, y, z in dk] + [m.v((-x, y, z)) for x, y, z in reversed(dk)]
    oface(m, pts, Cc["deck"], Vector((0, station_y(0.95), 0)))
    # gunwale rails (outwale + cap), port and starboard
    ro, ru = B["rail"]
    for s in (-1, 1):
        path = [Vector((s * (half_breadth(t) - B["thick"] * 0.5), hull_y(t, sheer(t)), sheer(t) + ru * 0.6)) for t in ts]
        path[-1].x = s * 0.02
        sweep(m, path, [(ru, ro + B["thick"] * 0.5)] * len(path), Cc["rail"], sides=4,
              axis=lambda p, t: Vector((0, 0, 1)))
    # keel and stem
    kp = [Vector((0, station_y(t), keel(t) - 0.018)) for t in (0.01, 0.3, 0.6, 0.8, 0.92)]
    zm = (keel(1) + sheer(1)) / 2
    kp += [Vector((0, hull_y(1.0, keel(1.0)) + 0.012, keel(1.0) + 0.01)), Vector((0, hull_y(1.0, zm) + 0.018, zm)),
           Vector((0, hull_y(1.0, sheer(1.0) + 0.06) + 0.012, sheer(1.0) + 0.06))]
    sweep(m, smooth_path(kp, 2), [(0.022, 0.026)] * (2 * (len(kp) - 1) + 1), Cc["keel"], sides=4,
          axis=lambda p, t: Vector((1, 0, 0)))
    # thwart (two cats), stern seat, bow seat, floorboards
    ty = CREW["seat_y"]
    tt = (ty + B["length"] / 2) / B["length"]
    top = CREW["thwart_top"]
    w = inner_half_at(tt, top - 0.03) * 2
    box(m, (0, ty, top - 0.0175), (w, 0.26, 0.035), Cc["seat"])
    for (yy, zz, dep) in ((-1.55, 0.06, 0.40), (1.15, 0.12, 0.22)):
        t = (yy + B["length"] / 2) / B["length"]
        ww = inner_half_at(t, zz - 0.03) * 2
        box(m, (0, yy, zz - 0.0175), (ww, dep, 0.035), Cc["seat"])
    fz = CREW["floor"]
    for i, x in enumerate((-0.24, 0.0, 0.24)):
        y0, y1 = -1.2, 0.95
        lim = min(inner_half_at((y + B["length"] / 2) / B["length"], fz - 0.02) for y in (y0, y1))
        xx = max(-lim + 0.07, min(lim - 0.07, x))
        box(m, (xx, (y0 + y1) / 2, fz - 0.01), (0.15, y1 - y0, 0.02), B["colours"]["floor"])
    # oarlocks: a pad on the rail, a post and a U of rod open upward (the oar runs along X through it)
    pz = oarlock_pivot_z()
    rail_top = pz - 0.050
    for s in (-1, 1):
        x, y = s * CREW["oarlock_x"], CREW["oarlock_y"]
        box(m, (x, y, rail_top + 0.006), (0.05, 0.09, 0.012), Cc["oarlock"])
        u = [(x, y - 0.044, pz + 0.034), (x, y - 0.040, pz - 0.008), (x, y - 0.016, pz - 0.034), (x, y + 0.016, pz - 0.034),
             (x, y + 0.040, pz - 0.008), (x, y + 0.044, pz + 0.034)]
        sweep(m, u, [0.0065] * len(u), Cc["oarlock"], sides=5)
        sweep(m, [(x, y, rail_top + 0.01), (x, y, pz - 0.034)], [0.009, 0.009], Cc["oarlock"], sides=5)
    o = m.object(col)
    o["triangles"] = sum(len(p.vertices) - 2 for p in o.data.polygons)
    return o, {"thwart_len": round(w, 3), "pivot_z": round(pz, 3)}


# ------------------------------------------------------------------------------------------------
# Oar: origin at the oarlock pivot, handle inboard (-side), blade outboard (+side) along X
# ------------------------------------------------------------------------------------------------
OAR = {
    "inboard": 0.45, "outboard": 2.0, "handleR": 0.017, "handleLen": 0.30, "loomR": 0.024, "throatR": 0.019,
    "bladeStart": 1.38, "bladeHalf": 0.085, "bladeThick": 0.007, "sides": 8,
    "sleeve": (-0.07, 0.12, 0.028),      # leather sleeve where it sits in the oarlock (x0, x1, radius)
    "tip": 0.12,                          # painted blade tip length
    "colours": {"shaft": PAL["wood"]["light"], "handle": PAL["wood"]["dark"], "sleeve": PAL["fit"]["belt"],
                "button": PAL["fit"]["rope"], "tip": PAL["paint"]["red"]},
}


def build_oar(col, side):
    O, Co = OAR, OAR["colours"]
    name = "oar-starboard" if side > 0 else "oar-port"
    m = Mesh(name, smooth=True)
    X = lambda x: Vector((side * x, 0, 0))
    hi, hr = -O["inboard"], O["handleR"]
    # handle (darker, worn), then the loom and the shaft out to the blade throat
    hp = [X(hi), X(hi + 0.012), X(hi + O["handleLen"]), X(hi + O["handleLen"] + 0.05)]
    sweep(m, hp, [hr * 0.7, hr, hr, O["loomR"] * 0.9], Co["handle"], sides=O["sides"], caps=True)
    sp = [X(hi + O["handleLen"] + 0.05), X(0.0), X(0.6), X(O["bladeStart"] - 0.05), X(O["bladeStart"] + 0.08)]
    sweep(m, sp, [O["loomR"] * 0.9, O["loomR"], O["loomR"] * 0.92, O["throatR"], O["throatR"] * 0.8],
          Co["shaft"], sides=O["sides"], caps=False)
    x0, x1, sr = O["sleeve"]
    sweep(m, [X(x0), X(x1)], [sr, sr], Co["sleeve"], sides=O["sides"])
    sweep(m, [X(x1), X(x1 + 0.025)], [sr * 1.25, sr * 1.25], Co["button"], sides=O["sides"])
    # blade: flat, broad faces along Y (squared, as in the drive), widening then a rounded tip
    m.smooth = False
    b0, b1 = O["bladeStart"], O["outboard"]
    xs = [b0, b0 + 0.12, b0 + 0.28, b1 - O["tip"], b1 - 0.05, b1 - 0.012]
    hs = [O["throatR"], O["bladeHalf"] * 0.70, O["bladeHalf"] * 0.95, O["bladeHalf"], O["bladeHalf"] * 0.88, O["bladeHalf"] * 0.55]
    th = O["bladeThick"]
    rings = []
    for x, h in zip(xs, hs):
        tt = th if h > O["throatR"] else O["throatR"] * 0.8
        rings.append([Vector((side * x, -tt, -h)), Vector((side * x, tt, -h)), Vector((side * x, tt, h)), Vector((side * x, -tt, h))])
    vr = [[m.v(p) for p in r] for r in rings]
    cen = Vector((side * (b0 + b1) / 2, 0, 0))
    for i in range(len(vr) - 1):
        col_ = Co["tip"] if xs[i] >= b1 - O["tip"] - 1e-6 else Co["shaft"]
        for j in range(4):
            k = (j + 1) % 4
            c_ = (rings[i][j] + rings[i][k] + rings[i + 1][j] + rings[i + 1][k]) / 4
            oface(m, (vr[i][j], vr[i][k], vr[i + 1][k], vr[i + 1][j]), col_, Vector((c_.x, 0, 0)))
    tip = m.v(Vector((side * b1, 0, 0)))
    for j in range(4):
        k = (j + 1) % 4
        oface(m, (vr[-1][j], vr[-1][k], tip), Co["tip"], Vector((side * (b1 - 0.2), 0, 0)))
    o = m.object(col)
    o["triangles"] = sum(len(p.vertices) - 2 for p in o.data.polygons)
    return o


# ------------------------------------------------------------------------------------------------
# Bow lantern: a wooden shepherd's-crook post on the foredeck, its hook reaching forward over the
# stem, a short chain and an old hexagonal brass oil lantern hanging from it. Two meshes in boat
# space (origin at the boat origin): lantern-post (everything but the glass) and lantern-glass (the
# glass alone, one flat warm colour; the game draws it unlit and glowing).
# ------------------------------------------------------------------------------------------------
LANTERN = {
    "base": (0.0, 1.60),      # post foot (x, y) on the foredeck (Blender; glTF z = -y)
    "deck": 0.450,            # foredeck height there
    "postR": (0.038, 0.031),  # post radius at the foot and at the top of the straight part
    "postTop": 1.10,          # where the straight post ends and the crook begins
    "crook": [(0.0, 0.0), (0.015, 0.10), (0.10, 0.175), (0.215, 0.165), (0.285, 0.095), (0.292, 0.060)],  # (forward, up) from the post top; the last point is the hook tip
    "crookR": (0.031, 0.022), "postSides": 8, "crookSides": 6, "crookSteps": 2,
    "foot": (0.13, 0.13, 0.03),  # foot block (x, y, z) bolted to the deck
    "centre": 0.95,           # lantern centre height (bottom finial to top of the carrying ring)
    "height": 0.30,           # lantern height
    "radius": 0.096,          # hexagon corner radius of the base plate and the rim
    "bar": 0.0085, "barBulge": 0.006,   # corner bar radius and how far the cage bows out at mid height
    "glassR": (0.072, 0.081),  # glass corner radius at its ends and in the middle
    "links": 2, "linkR": 0.0035, "linkW": 0.012,
    "colours": {"post": PAL["wood"]["dark"], "foot": PAL["wood"]["deep"], "brass": PAL["fit"]["winch"],
                "bright": PAL["market"]["coin"], "chain": PAL["metal"]["steel"], "glass": PAL["light"]["lamp"]},
}


def hex_ring(c, r, z, n=6, phase=0.0):
    """A horizontal ring of n points about the vertical axis through c (corner at angle `phase`)."""
    return [Vector((c.x + r * math.cos(phase + math.tau * j / n), c.y + r * math.sin(phase + math.tau * j / n), z))
            for j in range(n)]


def loop_ring(m, c, rx, rz, plane, tube, hexint, n=8, sides=4):
    """A closed wire loop (ring or chain link): an ellipse with half sizes rx (across) and rz (up) in the
    vertical plane `plane` ('x' = XZ, 'y' = YZ), swept with a `sides`-gon of radius `tube`."""
    u = Vector((1, 0, 0)) if plane == "x" else Vector((0, 1, 0))
    path = [c + u * (rx * math.cos(math.tau * j / n)) + Vector((0, 0, rz * math.sin(math.tau * j / n))) for j in range(n)]
    sweep(m, path, [tube] * n, hexint, sides=sides, caps=False, loop=True, axis=lambda p, t: p - c)


def collar(m, a, b, ra, rb, hexint, sides, top=True):
    """A short open band around a post from a to b, capped at the top only (the bottom hides in the foot)
    or at the bottom only (top=False: a band whose top hides in the crook)."""
    a, b = Vector(a), Vector(b)
    rings = sweep_rings([a, b], [ra, rb], sides)
    m.tube(rings, hexint, cap0=None if top else a, cap1=b if top else None)


def lantern_layout():
    """Heights of the lantern parts (bottom up) and the hook tip / hanging axis."""
    L = LANTERN
    bx, by = L["base"]
    pts = [Vector((bx, by + f, L["postTop"] + u)) for f, u in L["crook"]]
    tip = pts[-1]
    h = L["height"]
    zb = L["centre"] - h / 2
    k = h / 0.305                        # the proportions below sum to 0.305
    z = {"bottom": zb}
    for name, d in (("finial", 0.020), ("base", 0.035), ("cage", 0.130), ("rim", 0.020), ("dome", 0.030),
                    ("chimney", 0.020), ("hat", 0.010), ("ring", 0.040)):
        z[name] = z[list(z)[-1]] + d * k
    return pts, tip, z, k


def build_lantern(col):
    L, Co = LANTERN, LANTERN["colours"]
    bx, by = L["base"]
    crook, tip, z, k = lantern_layout()
    ax = Vector((tip.x, tip.y, 0))      # the lantern's vertical axis hangs straight under the hook tip
    m = Mesh("lantern-post", smooth=False)
    # foot block and four bolts
    fx, fy, fz = L["foot"]
    box(m, (bx, by, L["deck"] + fz / 2 - 0.006), (fx, fy, fz), Co["foot"])
    for sy in (-1, 1):
        box(m, (bx, by + sy * fy * 0.34, L["deck"] + fz - 0.002), (0.020, 0.020, 0.010), Co["brass"])
    # straight post (octagonal, tapering) with a brass collar at the foot and at the crook
    r0, r1 = L["postR"]
    ps = L["postSides"]
    m.smooth = True
    sweep(m, [(bx, by, L["deck"] + fz - 0.01), (bx, by, L["postTop"])], [r0, r1], Co["post"], sides=ps, caps=False)
    zc = L["deck"] + fz
    collar(m, (bx, by, zc - 0.012), (bx, by, zc + 0.045), r0 * 1.22, r0 * 1.14, Co["brass"], ps)
    # crook: the post bends forward over the stem and curls down to the hook tip
    path = smooth_path(crook, L["crookSteps"])
    cr0, cr1 = L["crookR"]
    n = len(path)
    radii = [lerp(cr0, cr1, (i / (n - 1)) ** 1.3) for i in range(n)]
    sweep(m, [Vector((bx, by, L["postTop"] - 0.02))] + path[1:], [r1] + radii[1:], Co["post"],
          sides=L["crookSides"], caps=False)
    collar(m, (bx, by, L["postTop"] - 0.05), (bx, by, L["postTop"] + 0.01), r1 * 1.25, r1 * 1.25, Co["brass"], ps, top=False)
    d = (path[-1] - path[-2]).normalized()
    collar(m, tip - d * 0.035, tip + d * 0.008, cr1 * 1.3, cr1 * 1.15, Co["brass"], L["crookSides"])
    # chain: links alternate planes from the hook tip down to the lantern's carrying ring
    top = tip.z - 0.002
    ring_top = z["ring"]
    lr = L["linkR"]
    nl = L["links"]
    span = (top - ring_top) / nl
    for i in range(nl):
        c = Vector((ax.x, ax.y, top - span * (i + 0.5)))
        loop_ring(m, c, L["linkW"], span / 2 + lr * 1.6, "x" if i % 2 == 0 else "y", lr, Co["chain"], n=6, sides=4)
    # lantern, bottom up (flat-shaded hexagonal brass)
    m.smooth = False
    R = L["radius"]
    zb = z["bottom"]
    m.tube([hex_ring(ax, 0.012 * k, zb), hex_ring(ax, 0.030 * k, z["finial"] - 0.004)], Co["brass"],
           cap0=Vector((ax.x, ax.y, zb)))                                                       # finial
    m.tube([hex_ring(ax, R * 0.92, z["finial"] - 0.004), hex_ring(ax, R, z["finial"] + 0.008),
            hex_ring(ax, R, z["base"])], Co["brass"], cap1=Vector((ax.x, ax.y, z["base"])))     # base plate
    gr0, gr1 = L["glassR"]
    for j in range(6):                                                                          # corner bars
        a = math.tau * j / 6
        u = Vector((math.cos(a), math.sin(a), 0))
        rr = (gr0 + R) / 2 + 0.004
        bar = [ax + u * rr + Vector((0, 0, z["base"] - 0.004)),
               ax + u * (rr + L["barBulge"]) + Vector((0, 0, (z["base"] + z["cage"]) / 2)),
               ax + u * rr + Vector((0, 0, z["cage"] + 0.004))]
        sweep(m, bar, [L["bar"]] * 3, Co["brass"], sides=4, caps=False)
    m.tube([hex_ring(ax, R * 0.95, z["cage"]), hex_ring(ax, R, z["cage"] + 0.006), hex_ring(ax, R, z["rim"])],
           Co["brass"], cap0=Vector((ax.x, ax.y, z["cage"])))                                   # top rim
    m.tube([hex_ring(ax, R * 0.96, z["rim"]), hex_ring(ax, R * 0.70, z["rim"] + (z["dome"] - z["rim"]) * 0.55),
            hex_ring(ax, 0.030 * k, z["dome"])], Co["brass"])                                   # dome
    m.tube([hex_ring(ax, 0.022 * k, z["dome"] - 0.004), hex_ring(ax, 0.020 * k, z["chimney"])], Co["brass"])   # chimney
    m.tube([hex_ring(ax, 0.034 * k, z["chimney"]), hex_ring(ax, 0.030 * k, z["hat"])], Co["bright"],
           cap0=Vector((ax.x, ax.y, z["chimney"])), cap1=Vector((ax.x, ax.y, z["hat"])))       # chimney hat
    rh = (z["ring"] - z["hat"]) / 2
    loop_ring(m, Vector((ax.x, ax.y, z["hat"] + rh)), rh * 0.95, rh - 0.0045, "y", 0.0045, Co["bright"], n=6, sides=4)
    post = m.object(col)
    # glass: a slightly bulging hexagonal prism inside the cage
    g = Mesh("lantern-glass", smooth=False)
    g0, g1 = z["base"], z["cage"]
    g.tube([hex_ring(ax, gr0, g0), hex_ring(ax, gr1, (g0 + g1) / 2), hex_ring(ax, gr0, g1)], Co["glass"],
           cap0=Vector((ax.x, ax.y, g0)), cap1=Vector((ax.x, ax.y, g1)))
    glass = g.object(col)
    for o in (post, glass):
        o["triangles"] = lib.triangles(o)
    info = {"post": post["triangles"], "glass": glass["triangles"],
            "glass_centre": [round(ax.x, 3), round(ax.y, 3), round((g0 + g1) / 2, 3)],
            "glass_size": [round(2 * gr1, 3), round(g1 - g0, 3)], "hook_tip": [round(c, 3) for c in tip]}
    return post, glass, info


# ------------------------------------------------------------------------------------------------
# Scene
# ------------------------------------------------------------------------------------------------
WATER_Z = -0.33   # preview water plane (below the keel so the inside of the hull shows; the real waterline is z = 0)


def build_scene(scene_name="Rowers"):
    scene = bpy.data.scenes.get(scene_name) or bpy.data.scenes.new(scene_name)
    for o in list(scene.collection.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    cols = {}
    for name in ("rowers", "oars", "rowboat-set", "rowers-stage"):
        c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
        if c.name not in [x.name for x in scene.collection.children]:
            scene.collection.children.link(c)
        cols[name] = c
    report = {}
    boat, binfo = build_boat(cols["rowboat-set"])
    report["rowboat"] = {"tris": boat["triangles"], **binfo}
    for key in VARIANTS:
        root, tris = build_cat(cols["rowers"], key)
        s = VARIANTS[key]["oar"]
        root.location = (s * CREW["seat_x"], CREW["seat_y"], CREW["thwart_top"])
        report[f"rower-{key}"] = tris
    pz = oarlock_pivot_z()
    for s in (1, -1):
        o = build_oar(cols["oars"], s)
        o.location = (s * CREW["oarlock_x"], CREW["oarlock_y"], pz)
        report[o.name] = o["triangles"]
    lp, lg, linfo = build_lantern(cols["rowboat-set"])
    report["lantern"] = linfo
    report["crew_total"] = (report["rowboat"]["tris"] + sum(report[f"rower-{k}"]["total"] for k in VARIANTS)
                            + report["oar-starboard"] + report["oar-port"])
    # stage: water plane, lights, camera (render-only helpers, not part of any asset)
    me = bpy.data.meshes.new("rowers-water")
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, radius=12, segments=48)
    bm.to_mesh(me)
    bm.free()
    water = bpy.data.objects.new("rowers-water", me)
    water.location.z = WATER_Z
    water.data.materials.append(V.pmat(f"c{int(PAL['hut']['glass']):06x}", int(PAL["hut"]["glass"]), 0.4))
    cols["rowers-stage"].objects.link(water)
    world = bpy.data.worlds.get("rowers-world") or bpy.data.worlds.new("rowers-world")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.80, 0.82, 0.84, 1)
    bg.inputs["Strength"].default_value = 1.0
    scene.world = world
    for name, energy, color, rot in (("rowers-key", 3.0, (1.0, 0.95, 0.88), (52, 0, 152)),
                                     ("rowers-fill", 0.9, (0.85, 0.9, 1.0), (65, 0, -40))):
        ld = bpy.data.lights.get(name) or bpy.data.lights.new(name, "SUN")
        ld.energy = energy
        ld.color = color
        ld.angle = math.radians(8)
        lo = bpy.data.objects.new(name, ld)
        lo.rotation_euler = tuple(math.radians(a) for a in rot)
        cols["rowers-stage"].objects.link(lo)
    cd = bpy.data.cameras.get("rowers-cam") or bpy.data.cameras.new("rowers-cam")
    cam = bpy.data.objects.new("rowers-cam", cd)
    cols["rowers-stage"].objects.link(cam)
    scene.camera = cam
    scene.render.engine = "BLENDER_EEVEE"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    try:
        scene.eevee.taa_render_samples = 32
    except AttributeError:
        pass
    V.dedupe_materials(scene)
    aim(scene, "crew")
    return report


def aim(scene, shot):
    cam = scene.camera
    if shot == "crew":      # from astern, raised (the cats face the camera)
        cam.data.lens = 40
        target = Vector((0, 0.1, 0.35))
        eye = target + Vector((2.6, -4.6, 2.6))
        res = (1600, 1000)
    elif shot == "side":
        cam.data.lens = 35
        target = Vector((0, 0, 0.2))
        eye = target + Vector((7.5, 0.0, 1.2))
        res = (1600, 800)
    elif shot == "top":
        cam.data.lens = 35
        target = Vector((0, 0, 0))
        eye = Vector((0.01, 0.0, 9.0))
        res = (1000, 1400)
    elif shot == "bow":     # from ahead, raised (the cats' backs)
        cam.data.lens = 40
        target = Vector((0, 0.1, 0.35))
        eye = target + Vector((-2.2, 4.8, 2.4))
        res = (1600, 1000)
    elif shot == "lantern":  # close on the bow lantern, from the starboard quarter
        cam.data.lens = 50
        target = Vector((0, 1.72, 0.80))
        eye = target + Vector((1.55, -1.35, 0.45))
        res = (1000, 1000)
    elif shot == "lanternSide":
        cam.data.lens = 50
        target = Vector((0, 1.65, 0.75))
        eye = target + Vector((2.6, 0.0, 0.15))
        res = (1000, 1000)
    else:                   # 'cat': close on the ginger cat
        cam.data.lens = 70
        target = Vector((0.3, 0.22, 0.55))
        eye = target + Vector((0.9, -2.6, 0.7))
        res = (1000, 1000)
    cam.location = eye
    cam.rotation_euler = (target - eye).to_track_quat("-Z", "Y").to_euler()
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100


def render(path, shot="crew", scene_name="Rowers"):
    scene = bpy.data.scenes[scene_name]
    aim(scene, shot)
    win = bpy.context.window
    prev = win.scene if win else None
    if win:
        win.scene = scene
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True, scene=scene_name)
    if win and prev is not None:
        win.scene = prev
    return path


# ------------------------------------------------------------------------------------------------
# Export: public/models/rower-<key>.glb, rower-oar-<side>.glb, rowboat.glb (follows vendors.export_glb)
# ------------------------------------------------------------------------------------------------
# glTF parts (flat children of one root; each node origin = its pivot). The forearms are children of the
# arms in the Blender scene; here they are flat siblings (the game poses them with the elbow solve).
CAT_PARTS = {"body": "{k}-body", "head": "{k}-head", "tail": "{k}-tail", "arm-left": "{k}-arm.L",
             "arm-right": "{k}-arm.R", "fore-left": "{k}-fore.L", "fore-right": "{k}-fore.R"}
EXPORTS = (   # (file, root name, source root or None, {glTF part name: source object})
    ("rower-ginger", "rower-ginger", "rower-ginger", {n: o.format(k="ginger") for n, o in CAT_PARTS.items()}),
    ("rower-grey", "rower-grey", "rower-grey", {n: o.format(k="grey") for n, o in CAT_PARTS.items()}),
    ("rower-oar-starboard", "oar-starboard", None, {"oar": "oar-starboard"}),
    ("rower-oar-port", "oar-port", None, {"oar": "oar-port"}),
    ("rowboat", "rowboat", None, {"hull": "rowboat"}),
    ("rower-lantern", "rower-lantern", None, {"post": "lantern-post", "glass": "lantern-glass"}),
)


def export_lantern(out_dir, scene_name="Rowers"):
    """Write only rower-lantern.glb (root at the boat origin, children `post` and `glass` in boat space)."""
    return export_glb(out_dir, scene_name, only=("rower-lantern",))


def export_glb(out_dir, scene_name="Rowers", only=None):
    """Write the GLBs (or only the files named in `only`) from renamed copies in a temporary scene (the Rowers scene is untouched).
    Roots sit at the origin with identity rotation and scale; parts are flat children keeping their pivots
    (the cat parts at their offsets from the cat root, the oar and hull at the origin). Y-up: Blender -Y
    (the cats' front) becomes glTF +Z. Returns [(file, triangles)]."""
    src = bpy.data.scenes[scene_name]
    win = bpy.context.window
    prev = win.scene if win else None
    tmp = bpy.data.scenes.new("rowers-export")
    if win:
        win.scene = tmp
    done = []
    renamed = []                                # (object, original name) to restore
    try:
        os.makedirs(out_dir, exist_ok=True)
        for fname, root_name, src_root, parts in EXPORTS:
            if only is not None and fname not in only:
                continue
            sources = {}
            for old in ([src_root] if src_root else []) + list(parts.values()):
                o = src.objects[old]
                sources[old] = o
            for old, o in sources.items():
                renamed.append((o, old))
                o.name = f"{old}-src"           # copies take the exact names (object names are global)
            wanted = {root_name, *parts}
            for nm in wanted:                   # any other scene's object holding a wanted name steps aside
                o = bpy.data.objects.get(nm)
                if o is not None:
                    renamed.append((o, nm))
                    o.name = f"{nm}-held"
            r2 = bpy.data.objects.new(root_name, None)
            tmp.collection.objects.link(r2)
            inv = sources[src_root].matrix_world.inverted() if src_root else Matrix.Identity(4)
            tris = 0
            for new, old in parts.items():
                o = sources[old]
                c = o.copy()
                c.data = o.data.copy()
                c.name = new
                tmp.collection.objects.link(c)
                c.parent = r2
                c.matrix_parent_inverse = Matrix.Identity(4)
                rel = (inv @ o.matrix_world).to_translation() if src_root else Vector((0, 0, 0))
                c.matrix_basis = Matrix.Translation(rel)    # pure offset: no rotation, no scale
                lib.bake_colors(c)
                tris += lib.triangles(c)
            bpy.context.view_layer.update()
            for x in bpy.data.objects:
                x.select_set(False)
            for o in [r2] + list(r2.children):
                o.select_set(True)
            bpy.ops.export_scene.gltf(
                filepath=os.path.join(out_dir, f"{fname}.glb"), export_format="GLB", use_selection=True,
                use_active_scene=True, export_vertex_color="ACTIVE", export_materials="EXPORT",
                export_cameras=False, export_lights=False, export_apply=True, export_yup=True)
            done.append((fname, tris))
            for o in list(r2.children) + [r2]:
                me = o.data if o.type == "MESH" else None
                bpy.data.objects.remove(o, do_unlink=True)
                if me is not None:
                    bpy.data.meshes.remove(me)
            for o, nm in reversed(renamed):
                o.name = nm
            renamed.clear()
    finally:
        for o, nm in reversed(renamed):
            o.name = nm
        if win and prev is not None:
            win.scene = prev
        bpy.data.scenes.remove(tmp)
    return done
