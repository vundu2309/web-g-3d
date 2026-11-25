"""The patrol ship (public/models/boat-patrol.glb): a coast-guard cutter of the game's boat family.

Same hull lines, deck, lantern and flag as the player's boats (`boat.py`, `upgrade_boats.py`), the
same two colour ROLES the game recolours (`boat-hull` 0x2A6FB8, `boat-trim` 0xFFD35A in the file; the
patrol ships are painted white and navy at run time, palette 4 of src/ocean/palette.ts), and the
same six exported parts, so the game loads it like a boat tier:

    hull, deck, canopy, engine, flag, lantern     under a root called `boat`

It is 10.4 m long, a hair longer than the flagship, and low: a long white wheelhouse with a domed roof (the hull role: white
at run time) that carries a light bar (a blue and a red lens, the palette's `paint.beacon` and `paint.beaconRed`: colours of their own, so the game
finds the lenses by colour and lights them), two
searchlights and a steel mast with a radar bar and the flag of Vietnam; a water cannon on the
foredeck, rails all round, fenders, an orange rescue tender on the stern deck and a
life ring on the back of the house. Axes as boat.py: metres, Z up, bow to +Y, origin at the
waterline at midship.

Never calls lib.reset(); adds a NEW scene ("Patrol") to the running Blender:

    import sys; sys.path.insert(0, "/path/to/tools/blender")
    import importlib, boat, upgrade_boats, patrol_boat as P
    importlib.reload(boat); importlib.reload(upgrade_boats); importlib.reload(P)
    P.build_patrol_scene(); P.export_patrol("/path/to/public/models/boat-patrol.glb")
"""
import math
import bpy
from mathutils import Matrix, Vector
import lib
import boat as B
import upgrade_boats as U

PAL = lib.PAL
C = B.C
HULL_PAINT, TRIM_PAINT = B.HULL_PAINT, B.TRIM_PAINT
box, quadbox, cyl, ring, torus, ellipsoid = B.box, B.quadbox, B.cyl, B.ring, B.torus, B.ellipsoid
lerp = B.lerp

# The patrol ship's own tunables, in the shape upgrade_boats.TIERS wants (tier 5 is only a slot here).
PATROL = {
    "hull": {"length": 10.4, "halfBeam": 1.76, "sheerMid": 1.22, "sheerRise": 0.74, "keel": -0.74,
             "deck": 0.86, "stations": 28, "rake": 0.50, "sternBeam": 0.94},
    "house": {"y": (-0.75, 2.55), "halfWidth": 1.14, "height": 1.34, "corner": 0.34, "panes": 3, "side": 3},
    "crates": [(0.0, -3.0, 0)],
    "rail": (0.10, 0.96),
    "fenders": (0.24, 0.40, 0.56, 0.72),
}
SLOT = 5
U.TIERS[SLOT] = PATROL

STEEL = C["steel"]
BEACON = PAL["paint"]["beacon"]
RED = PAL["paint"]["beaconRed"]
TENDER = U.X["float"]          # coral: the rescue tender


def light_bar(m, c, width=1.0):
    """A light bar on the roof: a steel base with a blue lens to starboard and a red one to port (colours the game finds)."""
    c = Vector(c)
    box(m, c + Vector((0, 0, 0.05)), (width, 0.26, 0.10), STEEL)
    for s, col in ((1, BEACON), (-1, RED)):
        ellipsoid(m, c + Vector((s * width * 0.25, 0, 0.17)), (width * 0.22, 0.12, 0.10), col, seg=8, rings=4, smooth=True)
    # a small mid dome that stays white (a takedown light)
    ellipsoid(m, c + Vector((0, 0, 0.16)), (0.07, 0.07, 0.07), C["lamp"], seg=6, rings=3, smooth=False)


def steel_mast(m, foot, height):
    """A thin steel mast with a short crosstree, a radar bar and a whip antenna; returns the top."""
    foot = Vector(foot)
    top_ = foot + Vector((0, 0, height))
    cyl(m, foot - Vector((0, 0, 0.05)), top_, 0.06, 0.04, STEEL, n=6)
    cyl(m, foot - Vector((0, 0, 0.02)), foot + Vector((0, 0, 0.10)), 0.12, 0.11, STEEL, n=6)
    z = top_.z - height * 0.30
    cyl(m, (foot.x - 0.45, foot.y, z), (foot.x + 0.45, foot.y, z), 0.03, 0.03, STEEL, n=5)
    for s in (1, -1):
        ellipsoid(m, (foot.x + s * 0.45, foot.y, z + 0.05), (0.05, 0.05, 0.05), C["port"] if s < 0 else C["starboard"], seg=5, rings=3, smooth=False)
    zr = top_.z - height * 0.55
    box(m, (foot.x, foot.y + 0.10, zr), (0.14, 0.22, 0.12), STEEL)
    box(m, (foot.x, foot.y + 0.10, zr + 0.13), (1.15, 0.12, 0.07), U.X["radar"])
    cyl(m, (foot.x + 0.28, foot.y - 0.12, top_.z - height * 0.2), (foot.x + 0.34, foot.y - 0.18, top_.z + 0.55), 0.012, 0.008, STEEL, n=3)
    return top_


def water_cannon(m, c):
    """A water cannon on the foredeck: a post, a turret and a barrel pointing at the bow."""
    c = Vector(c)
    cyl(m, c, c + Vector((0, 0, 0.42)), 0.07, 0.06, STEEL, n=6)
    box(m, c + Vector((0, 0, 0.52)), (0.26, 0.30, 0.18), U.X["radar"])
    cyl(m, c + Vector((0, 0.05, 0.56)), c + Vector((0, 0.62, 0.66)), 0.05, 0.045, C["chrome"], n=6)
    cyl(m, c + Vector((0, 0.60, 0.65)), c + Vector((0, 0.66, 0.67)), 0.06, 0.06, STEEL, n=6)


def davit(m, y, z0, tender_col):
    """Two steel posts with a cross beam over the stern deck, and the rescue tender under it."""
    for s in (1, -1):
        cyl(m, (s * 1.0, y, z0), (s * 1.0, y, z0 + 1.35), 0.05, 0.05, STEEL, n=5)
    cyl(m, (-1.0, y, z0 + 1.35), (1.0, y, z0 + 1.35), 0.04, 0.04, STEEL, n=5)
    U.dinghy(m, (0, y, z0 + 0.34), L=2.7, W=1.25, Hh=0.46, col=tender_col)
    for s in (1, -1):
        cyl(m, (s * 0.55, y + 0.4, z0 + 0.62), (s * 0.95, y, z0 + 1.35), 0.012, 0.012, C["rope"], n=3, caps=False)


def build_patrol(col):
    """Builds the patrol ship under a root `boat-p`; returns (root, triangles per part)."""
    T = PATROL
    with U.tier_params(SLOT) as H:
        root = bpy.data.objects.new("boat-p", None)
        col.objects.link(root)
        hull = B.build_hull(col)
        U.fenders(hull, T["fenders"])
        deck = B.build_deck(col)
        U.rail(deck, *T["rail"], h=0.56, posts=9)
        # the foredeck: the water cannon and the bow anchor; the stern deck: the davit and the tender
        stern = -H["length"] / 2
        z0 = H["deck"]
        water_cannon(deck, (0, 3.35, z0))
        davit(deck, stern + 1.9, z0, TENDER)
        canopy = B.Mesh("boat-canopy")
        hs = T["house"]
        y0, y1 = hs["y"]
        cy, hl = (y0 + y1) / 2, (y1 - y0) / 2
        roof_z = U.house(canopy, cy, hl, hs["halfWidth"], z0, hs["height"], hs["corner"],
                         panes=hs["panes"], side=hs["side"], roof="dome", dome=0.11, wall=U.X["radar"])
        light_bar(canopy, (0, y1 - 0.55, roof_z), width=1.05)
        U.searchlight(canopy, (0.62, y1 - 0.12, roof_z), aim=(0, 1, 0.1))
        U.searchlight(canopy, (-0.62, y1 - 0.12, roof_z), aim=(0, 1, 0.1))
        top_ = steel_mast(canopy, (0, y0 + 0.65, roof_z), 2.1)
        U.stays(canopy, top_ - Vector((0, 0, 0.3)), [Vector((0.95, y0 + 0.15, roof_z)), Vector((-0.95, y0 + 0.15, roof_z)),
                                                    Vector((0, y1 - 0.2, roof_z))])
        eng, pivot = U.inboard(stern, H["keel"], H["deck"])
        flag = B.build_flag(top_ - Vector((0, 0, 0.08)))
        lan = B.build_lantern(top_)
        parts = {"hull": (hull, (0, 0, 0)), "deck": (deck, (0, 0, 0)), "canopy": (canopy, (0, cy, z0)),
                 "engine": (eng, pivot), "flag": (flag, top_ - Vector((0, 0, 0.08))), "lantern": (lan, top_)}
        return root, U._finish(col, root, parts, "p")


def build_patrol_scene(scene_name="Patrol"):
    """A NEW scene with the patrol ship on the water at true scale (bow +Y). Returns the triangles per part."""
    scene = bpy.data.scenes.get(scene_name) or bpy.data.scenes.new(scene_name)
    col = U._setup(scene, "patrol")
    root, tris = build_patrol(col)
    return tris


def export_patrol(path, scene_name="Patrol"):
    """Write the patrol ship as the root `boat` with the six parts (see boat.export_parts_glb)."""
    scene = bpy.data.scenes[scene_name]
    parts = {node: scene.objects[f"tp-{node}"] for node in B.GLB_NODES}
    return B.export_parts_glb(path, scene.objects["boat-p"], parts, "boat")


def render_views(out_dir, scene_name="Patrol"):
    """Four pictures of the ship for review: a three-quarter view from each side, the bow and the stern."""
    import os
    scene = bpy.data.scenes[scene_name]
    win = bpy.context.window
    prev = win.scene if win else None
    if win:
        win.scene = scene
    os.makedirs(out_dir, exist_ok=True)
    out = []
    try:
        for tag, eye, target in (("q-star", (9, 9.5, 5.2), (0, 0, 1.3)), ("q-port", (-9, -9.5, 5.2), (0, 0, 1.3)),
                                 ("bow", (0, 12.5, 3.4), (0, 0, 1.4)), ("stern", (0, -12.5, 3.4), (0, 0, 1.4))):
            U.aim(scene, eye, target, lens=50, res=(1280, 720))
            path = os.path.join(out_dir, f"patrol-{tag}.png")
            U.render(scene_name, path)
            out.append(path)
    finally:
        if win and prev is not None:
            win.scene = prev
    return out
