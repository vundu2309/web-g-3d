"""Builds the game's Blender assets into public/models/*.glb (run headless: needs `bpy`).

    .blender-venv/bin/python tools/blender/build.py [vendor ...]

Set up once with `uv venv .blender-venv --python 3.13 && uv pip install --python .blender-venv/bin/python bpy`
and refresh the palette with `npm run assets:palette` first (npm run assets does both). The GLBs
are committed, so a normal build and CI never need Blender.
"""
import os, sys
import bpy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib, vendor

ROOT = os.path.abspath(os.path.join(lib.HERE, "..", ".."))
OUT = os.path.join(ROOT, "public", "models")
# Triangle budgets: what the game can afford for one of each (see docs/ocean.md "Blender pipeline").
BUDGET = {"vendor_body": 3200, "vendor_arm": 450}


def build_vendor(vid, spec):
    lib.reset()
    made, keep, wave_pv, wave_parts, height = vendor.build(spec, low=True)
    # the waving arm: join its parts into one mesh under the shoulder pivot
    arm = lib.finish(wave_parts, "arm_wave_mesh", budget=BUDGET["vendor_arm"])
    arm.parent = wave_pv
    arm.matrix_parent_inverse = wave_pv.matrix_world.inverted()
    body = lib.finish(made, "vendor_body", keep=keep, budget=BUDGET["vendor_body"])
    for o in (body, wave_pv):
        o.scale = (height, height, height)
        o.location = (o.location[0] * height, o.location[1] * height, o.location[2] * height)
    path = os.path.join(OUT, f"vendor-{vid}.glb")
    lib.export(path, [body, wave_pv])
    print(f"{vid}: body {lib.triangles(body)} tris, arm {lib.triangles(arm)} tris -> {os.path.relpath(path, ROOT)}")


if __name__ == "__main__":
    wanted = [a for a in sys.argv[sys.argv.index("--") + 1:] if not a.startswith("-")] if "--" in sys.argv else sys.argv[1:]
    for vid, spec in vendor.VENDORS.items():
        if not wanted or vid in wanted:
            build_vendor(vid, spec)
