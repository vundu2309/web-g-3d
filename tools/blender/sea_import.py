"""
Turns a model downloaded from the Blender community (BlenderKit) into a sea-animal GLB for the game.

Run it inside Blender (the MCP `execute_blender_code`), after the models are in the scene:

    import sys; sys.path.insert(0, "<this folder>")
    import sea_import
    arrays = sea_import.extract("Blue Lobster", yaw=90)           # a dict of numpy arrays
    sea_import.write_glb("public/models/fish-tom-hum.glb", arrays)

What it does (the triangle count is NOT changed, only what the modifiers already produce):
  * takes the evaluated mesh (armature pose, subdivision, geometry nodes applied; multires and
    other editor-only levels are skipped), every part but the rig's custom bone shapes (WGT-*);
  * bakes each material's base colour into a COLOR_0 vertex colour, sampling the image texture
    through the UVs (Blender 5.3 here has no Cycles, so it samples the pixels itself);
  * turns the model about Z by `yaw` degrees so the nose points to +X, centres it, scales the
    longest side to 1 and writes the contract in src/ocean/glb-parts.ts: root `fish` with the
    children `body` (mesh, no roles: every colour is fixed) and `hook` (an empty node at the nose).
Blender is Z up; glTF is Y up, so a Blender (x, y, z) is written as (x, z, -y).
"""
import json
import math
import struct

import bpy
import numpy as np

# The four ROLE colours of glb-parts.ts (sRGB bytes): a real colour must never equal one of them.
ROLES = [(255, 0, 1), (0, 255, 1), (1, 0, 255), (255, 255, 1)]


def _lin_to_srgb(c):
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def _base_colour(mat):
    """(image pixels (h, w, 4) in sRGB 0..1 or None, constant sRGB rgb) for a material."""
    const = np.array([0.8, 0.8, 0.8])
    if mat is None or not mat.use_nodes:
        return None, const
    bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return None, const
    sock = bsdf.inputs["Base Color"]
    const = _lin_to_srgb(np.array(sock.default_value[:3]))
    if not sock.links and np.allclose(sock.default_value[:3], 0.8, atol=1e-3):
        em = next((n for n in mat.node_tree.nodes if n.type == "EMISSION"), None)
        if em is not None:  # a glowing material: its glow is its colour
            const = _lin_to_srgb(np.array(em.inputs["Color"].default_value[:3]))
    # walk upstream from Base Color to the first image texture
    seen, queue = set(), [sock]
    while queue:
        s = queue.pop(0)
        for link in s.links:
            n = link.from_node
            if n.name in seen:
                continue
            seen.add(n.name)
            if n.type == "TEX_IMAGE" and n.image is not None and n.image.size[0] > 0:
                im = n.image
                w, h = im.size
                px = np.empty(w * h * 4, dtype=np.float32)
                im.pixels.foreach_get(px)
                return px.reshape(h, w, 4), const
            queue.extend(n.inputs)
    return None, const


def _sample(px, uv):
    """Bilinear sample of an (h, w, 4) image at uv (n, 2), wrapping; returns (n, 3)."""
    h, w = px.shape[:2]
    x = (uv[:, 0] % 1.0) * (w - 1)
    y = (uv[:, 1] % 1.0) * (h - 1)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    x1, y1 = np.minimum(x0 + 1, w - 1), np.minimum(y0 + 1, h - 1)
    fx, fy = (x - x0)[:, None], (y - y0)[:, None]
    c = (px[y0, x0, :3] * (1 - fx) * (1 - fy) + px[y0, x1, :3] * fx * (1 - fy)
         + px[y1, x0, :3] * (1 - fx) * fy + px[y1, x1, :3] * fx * fy)
    return c


def _parts(root, skip_levels=True):
    out = []
    for o in [root] + list(root.children_recursive):
        if o.type != "MESH" or o.name.startswith("WGT") or o.hide_get() or o.hide_viewport:
            continue
        out.append(o)
    return out


def extract(name, yaw=0.0, hook_up=0.0, mirror_y=False, paint=None):
    """The model `name` as arrays in Blender axes, nose +X, centred, longest side 1.

    `paint(positions, normals) -> colours` colours the parts that have no material at all (some
    downloads ship without one), after the model is turned, centred and scaled."""
    root = bpy.data.objects[name]
    disabled = []
    for o in _parts(root):  # multires would evaluate at its editor level (170k triangles): use the base
        for m in o.modifiers:
            if m.type == "MULTIRES" and m.show_viewport:
                m.show_viewport = False
                disabled.append(m)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    pos, nor, col, idx, bare = [], [], [], [], []
    base = 0
    for o in _parts(root):
        eo = o.evaluated_get(dg)
        me = eo.to_mesh()
        me.calc_loop_triangles()
        nt = len(me.loop_triangles)
        if nt == 0:
            eo.to_mesh_clear()
            continue
        nv = len(me.vertices)
        co = np.empty(nv * 3, dtype=np.float64)
        me.vertices.foreach_get("co", co)
        co = co.reshape(nv, 3)
        tl = np.empty(nt * 3, dtype=np.int64)
        me.loop_triangles.foreach_get("loops", tl)
        tm = np.empty(nt, dtype=np.int64)
        me.loop_triangles.foreach_get("material_index", tm)
        nl = len(me.loops)
        lv = np.empty(nl, dtype=np.int64)
        me.loops.foreach_get("vertex_index", lv)
        cn = np.empty(nl * 3, dtype=np.float64)
        me.corner_normals.foreach_get("vector", cn)
        cn = cn.reshape(nl, 3)
        uvl = me.uv_layers.active
        uv = np.zeros((nl, 2))
        if uvl is not None:
            tmp = np.empty(nl * 2, dtype=np.float64)
            uvl.data.foreach_get("uv", tmp)
            uv = tmp.reshape(nl, 2)
        # colour of every corner of every triangle
        corner_loops = tl
        corner_mat = np.repeat(tm, 3)
        ccol = np.zeros((nt * 3, 3))
        bare_flag = np.zeros(nt * 3, dtype=bool)
        mats = list(o.data.materials)
        for mi in np.unique(corner_mat):
            mat = mats[mi] if mi < len(mats) else None
            px, const = _base_colour(mat)
            sel = corner_mat == mi
            if mat is None:
                bare_flag[sel] = True
            if px is None:
                ccol[sel] = const
            else:
                ccol[sel] = _sample(px, uv[corner_loops[sel]])
        # one vertex per (point, colour, normal) so seams and flat facets stay as they are
        cv = lv[corner_loops]
        key = np.concatenate([
            cv[:, None].astype(np.float64),
            np.round(ccol * 255),
            np.round(cn[corner_loops] * 64),
        ], axis=1)
        uniq, first, inverse = np.unique(key, axis=0, return_index=True, return_inverse=True)
        inverse = inverse.reshape(-1)
        mw = np.array(eo.matrix_world)
        p = co[cv[first]]
        p = (mw[:3, :3] @ p.T).T + mw[:3, 3]
        n = cn[corner_loops[first]]
        n = (np.linalg.inv(mw[:3, :3]).T @ n.T).T
        n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
        pos.append(p)
        nor.append(n)
        col.append(ccol[first])
        bare.append(bare_flag[first])
        idx.append(inverse.reshape(-1, 3) + base)
        base += len(first)
        eo.to_mesh_clear()
    for m in disabled:
        m.show_viewport = True
    P, N, C, I = np.vstack(pos), np.vstack(nor), np.vstack(col), np.vstack(idx)
    B = np.concatenate(bare)
    # orient: yaw about Z so the nose points to +X
    a = math.radians(yaw)
    R = np.array([[math.cos(a), -math.sin(a), 0], [math.sin(a), math.cos(a), 0], [0, 0, 1]])
    P, N = P @ R.T, N @ R.T
    if mirror_y:
        P[:, 1] *= -1
        N[:, 1] *= -1
        I = I[:, ::-1]
    lo, hi = P.min(0), P.max(0)
    centre = (lo + hi) / 2
    scale = 1.0 / float((hi - lo).max())
    P = (P - centre) * scale
    hi2 = (hi - centre) * scale
    hook = np.array([hi2[0] * 0.92, 0.0, hook_up * hi2[2]])
    if paint is not None and B.any():
        C = C.copy()
        C[B] = paint(P[B], N[B])
    return {"pos": P, "nor": N, "col": np.clip(C, 0, 1), "idx": I.astype(np.int64), "hook": hook,
            "scale_to_metres": 1.0 / scale}


def write_glb(path, a):
    """The contract of src/ocean/glb-parts.ts: root `fish`, children `body` and `hook`."""
    def g(v):  # Blender (x, y, z) -> glTF (x, z, -y)
        v = np.asarray(v, dtype=np.float32)
        return np.stack([v[..., 0], v[..., 2], -v[..., 1]], axis=-1)
    pos, nor = g(a["pos"]), g(a["nor"])
    rgb = np.round(a["col"] * 255).astype(np.int64)
    for r in ROLES:  # a real colour must not read as a role colour: nudge its blue channel
        hit = (rgb == np.array(r)).all(axis=1)
        rgb[hit, 2] = np.where(rgb[hit, 2] < 128, rgb[hit, 2] + 3, rgb[hit, 2] - 3)
    col = np.concatenate([rgb * 257, np.full((len(rgb), 1), 65535)], axis=1).astype("<u2")
    idx = a["idx"].astype("<u4").reshape(-1)
    blobs, views = [], []

    def add(arr):
        b = arr.tobytes()
        pad = (-len(b)) % 4
        off = sum(len(x) for x in blobs)
        blobs.append(b + b"\0" * pad)
        views.append({"buffer": 0, "byteOffset": off, "byteLength": len(b)})
        return len(views) - 1
    v_pos, v_nor, v_col, v_idx = add(pos.astype("<f4")), add(nor.astype("<f4")), add(col), add(idx)
    hook = g(a["hook"]).astype(float).tolist()
    gl = {
        "asset": {"version": "2.0", "generator": "tools/blender/sea_import.py"},
        "scene": 0, "scenes": [{"nodes": [0]}],
        "nodes": [{"name": "fish", "children": [1, 2]}, {"name": "body", "mesh": 0},
                  {"name": "hook", "translation": hook}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1, "COLOR_0": 2},
                                    "indices": 3, "mode": 4}]}],
        "accessors": [
            {"bufferView": v_pos, "componentType": 5126, "count": len(pos), "type": "VEC3",
             "min": pos.min(0).astype(float).tolist(), "max": pos.max(0).astype(float).tolist()},
            {"bufferView": v_nor, "componentType": 5126, "count": len(nor), "type": "VEC3"},
            {"bufferView": v_col, "componentType": 5123, "normalized": True, "count": len(col), "type": "VEC4"},
            {"bufferView": v_idx, "componentType": 5125, "count": len(idx), "type": "SCALAR"},
        ],
        "bufferViews": views,
        "buffers": [{"byteLength": sum(len(x) for x in blobs)}],
    }
    js = json.dumps(gl, separators=(",", ":")).encode()
    js += b" " * ((-len(js)) % 4)
    bn = b"".join(blobs)
    total = 12 + 8 + len(js) + 8 + len(bn)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(bn), 0x004E4942) + bn)
    return {"bytes": total, "vertices": len(pos), "triangles": len(idx) // 3}


def preview(a, name, collection, location=(0, 0, 0)):
    """The extracted arrays as a Blender mesh object (vertex colours as 'Col') for a check render."""
    me = bpy.data.meshes.new(name)
    me.from_pydata(a["pos"].tolist(), [], a["idx"].tolist())
    me.update()
    attr = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    flat = np.concatenate([a["col"], np.ones((len(a["col"]), 1))], axis=1).astype(np.float32).reshape(-1)
    attr.data.foreach_set("color", flat)
    me.color_attributes.active_color = attr
    me.normals_split_custom_set_from_vertices([tuple(v) for v in a["nor"]])
    ob = bpy.data.objects.new(name, me)
    ob.location = location
    collection.objects.link(ob)
    return ob
