"""Shared helpers for the Blender asset pipeline (run headless through bpy, see build.py).

Everything an asset needs: colours from the game's own palette (palette.json, written from
src/ocean/art/colors.ts), skin-modifier limbs, lathes and balls, a baked vertex-colour pass
(the game draws every object as ONE mesh with per-vertex colours, like art/shapes.ts), a
triangle budget with a decimate pass that protects the face, and the GLB export.
"""
import json, math, os
import bpy, bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
PAL = json.load(open(os.path.join(HERE, "palette.json")))


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MATS.clear()


MATS = {}


def mat(name, hexint, rough=0.6):
    """A material that remembers its game colour (the sRGB hex, written to vertex colours on export)."""
    if name not in MATS:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        lin = lambda c: ((c / 255) ** 2.2)
        r, g, b = (hexint >> 16) & 255, (hexint >> 8) & 255, hexint & 255
        n = m.node_tree.nodes["Principled BSDF"]
        n.inputs["Base Color"].default_value = (lin(r), lin(g), lin(b), 1)
        n.inputs["Roughness"].default_value = rough
        m["hex"] = int(hexint)
        MATS[name] = m
    return MATS[name]


class Build:
    """One asset being built: its low-poly flag and the objects made so far."""

    def __init__(self, low):
        self.low = low
        self.keep = []  # objects whose triangles the decimate pass must protect (the face)

    # -- primitives -------------------------------------------------------------------------
    def smooth(self, o):
        for p in o.data.polygons:
            p.use_smooth = True

    def sub(self, o, levels):
        bpy.context.view_layer.objects.active = o
        levels = 0 if self.low else levels
        if levels:
            md = o.modifiers.new("s", "SUBSURF")
            md.levels = levels
            bpy.ops.object.modifier_apply(modifier="s")
        self.smooth(o)

    def ball(self, r, loc, m, scale=(1, 1, 1), seg=20, rings=12, rot=(0, 0, 0), keep=False):
        if self.low:
            seg, rings = max(8, seg // 2), max(6, rings // 2)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=seg, ring_count=rings, rotation=rot)
        o = bpy.context.object
        o.scale = scale
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        o.data.materials.append(m)
        self.smooth(o)
        if keep:
            self.keep.append(o)
        return o

    def box(self, size, loc, m, rot=(0, 0, 0), bevel=0.0, keep=False):
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
        o = bpy.context.object
        o.scale = size
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        if bevel:
            md = o.modifiers.new("b", "BEVEL")
            md.width = bevel
            md.segments = 1 if self.low else 3
            bpy.ops.object.modifier_apply(modifier="b")
        o.data.materials.append(m)
        self.smooth(o)
        if keep:
            self.keep.append(o)
        return o

    def bar(self, p1, p2, thick, m, depth=None):
        """A flat strap between two points."""
        a, b = Vector(p1), Vector(p2)
        d = b - a
        bpy.ops.mesh.primitive_cube_add(size=1, location=(a + b) / 2)
        o = bpy.context.object
        o.scale = (thick, depth or thick * 0.4, d.length)
        o.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        o.data.materials.append(m)
        self.smooth(o)
        return o

    def torus(self, major, minor, loc, m, scale=(1, 1, 1), rot=(0, 0, 0)):
        bpy.ops.mesh.primitive_torus_add(
            major_radius=major, minor_radius=minor, location=loc, rotation=rot,
            major_segments=16 if self.low else 36, minor_segments=6 if self.low else 8)
        o = bpy.context.object
        o.scale = scale
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        o.data.materials.append(m)
        self.smooth(o)
        return o

    def limb(self, name, chain, m, subd=1, branch=0.3):
        """A body part grown along a chain of (x, y, z, rx, ry) points with the Skin modifier."""
        me = bpy.data.meshes.new(name)
        o = bpy.data.objects.new(name, me)
        bpy.context.collection.objects.link(o)
        bm = bmesh.new()
        layer = bm.verts.layers.skin.verify()
        vs = [bm.verts.new(p[:3]) for p in chain]
        for a, b in zip(vs, vs[1:]):
            bm.edges.new((a, b))
        for v, p in zip(vs, chain):
            v[layer].radius = (p[3], p[4])
        vs[0][layer].use_root = True
        bm.to_mesh(me)
        bm.free()
        for x in bpy.data.objects:
            x.select_set(False)
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        md = o.modifiers.new("skin", "SKIN")
        md.branch_smoothing = branch
        md.use_smooth_shade = True
        bpy.ops.object.modifier_apply(modifier="skin")
        self.sub(o, subd)
        o.data.materials.append(m)
        return o

    def shell(self, name, rows, m, thickness=0.012, offset=1, subd=1):
        """A surface swept from rows of (x, y, z) points, thickened (aprons, hats)."""
        me = bpy.data.meshes.new(name)
        o = bpy.data.objects.new(name, me)
        bpy.context.collection.objects.link(o)
        bm = bmesh.new()
        grid = [[bm.verts.new(p) for p in row] for row in rows]
        closed = rows[0][0] == rows[0][-1]
        for k in range(len(grid) - 1):
            n = len(grid[k])
            for i in range(n - 1):
                bm.faces.new((grid[k][i], grid[k][i + 1], grid[k + 1][i + 1], grid[k + 1][i]))
        bm.to_mesh(me)
        bm.free()
        bpy.context.view_layer.objects.active = o
        md = o.modifiers.new("sol", "SOLIDIFY")
        md.thickness = thickness
        md.offset = offset
        bpy.ops.object.modifier_apply(modifier="sol")
        o.data.materials.append(m)
        self.sub(o, subd)
        return o


# ---------------------------------------------------------------------------------------------
# Export: bake colours, decimate, join, write the GLB.
# ---------------------------------------------------------------------------------------------
def bake_colors(o):
    """Per-corner vertex colours from each face's material hex (the sRGB values, as the game paints)."""
    me = o.data
    attr = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    for poly in me.polygons:
        slot = o.material_slots[poly.material_index].material if o.material_slots else None
        h = int(slot["hex"]) if slot is not None and "hex" in slot else 0xFFFFFF
        c = (((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255, 1.0)
        for li in poly.loop_indices:
            attr.data[li].color = c
    me.color_attributes.active_color = attr


def triangles(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def finish(objs, name, keep=(), budget=None):
    """Join `objs` into one mesh called `name` with baked colours, decimated to `budget` triangles
    (the objects in `keep` hold their detail). Returns the mesh object."""
    objs = list(objs)
    keep = set(keep)
    for o in objs:
        bpy.context.view_layer.objects.active = o
        for x in bpy.data.objects:
            x.select_set(False)
        o.select_set(True)
        bake_colors(o)
        vg = o.vertex_groups.new(name="keep")
        vg.add(list(range(len(o.data.vertices))), 1.0 if o in keep else 0.0, "REPLACE")
    for x in bpy.data.objects:
        x.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    body = bpy.context.object
    body.name = name
    body.data.materials.clear()
    body.data.materials.append(mat("solid", 0xFFFFFF))
    for p in body.data.polygons:
        p.use_smooth = True
    # Triangulate, then collapse to the budget while the face keeps its detail.
    md = body.modifiers.new("tri", "TRIANGULATE")
    bpy.ops.object.modifier_apply(modifier="tri")
    if budget and triangles(body) > budget:
        d = body.modifiers.new("dec", "DECIMATE")
        d.decimate_type = "COLLAPSE"
        d.ratio = max(0.05, budget / triangles(body))
        # Blender collapses a vertex in proportion to its weight (0 = never), so the group is
        # inverted: the face (weight 1 in "keep") holds still and everything else is collapsed.
        d.vertex_group = "keep"
        d.invert_vertex_group = True
        d.vertex_group_factor = 1.0
        d.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier="dec")
    return body


def export(path, objects):
    """Write a GLB with exactly these objects (and their children), Y-up, vertex colours on."""
    for x in bpy.data.objects:
        x.select_set(False)
    for o in objects:
        o.select_set(True)
        for c in o.children_recursive:
            c.select_set(True)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True,
        export_vertex_color="ACTIVE", export_materials="EXPORT", export_cameras=False,
        export_lights=False, export_apply=True, export_yup=True)
