"""Rebuilds the game's GLBs from their scripts, as listed in tools/blender/assets.json.

Run it in its OWN Blender (never the one you are working in: it starts from factory settings and
saves nothing):

    npm run assets:rebuild -- --out /some/folder [bait boat island-prop vendor person | file.glb ...]

    --out DIR   where the GLBs and rebuild-report.json go (required; public/models to replace the
                committed files, anything else to compare first)
    names       groups or file names of the catalogue to rebuild; none means every one with a script

It needs a window (the exporters set the window's scene), so Blender opens, works for a few
seconds and quits. `BLENDER=/path/to/Blender` overrides the default macOS location. The sea animals
(`"source": "community"`) are downloads and are not rebuilt. Exit code 1 if a script failed or a
catalogued file was not written. Afterwards `node scripts/check-asset-rebuild.mjs DIR` compares the
result with the catalogue (triangles, nodes, vertex colours).
"""
import json, os, sys, traceback
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


def arguments():
    rest = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out, names = None, []
    i = 0
    while i < len(rest):
        if rest[i] == "--out":
            out = os.path.abspath(rest[i + 1])
            i += 1
        else:
            names.append(rest[i])
        i += 1
    return out, names


def steps(out):
    """source script -> what to run for it (people last: build.py resets the whole file)."""
    import lib

    def baits():
        import baits as m
        m.build_scene()
        return m.export_all(out)

    def props():
        import props as m
        m.build_scene()
        return m.export_glb(out)

    def vendors():
        import vendors as m
        m.build_scene()
        return m.export_glb(out)

    def boats():
        import upgrade_boats as m
        m.build_boats_scene()
        m.build_shipyard_scene()
        return m.export_all(out)

    def people():
        import build as m
        import people as looks
        m.OUT = out
        return ("stepper", m, looks.LOOKS)

    return {
        "tools/blender/baits.py": baits,
        "tools/blender/props.py": props,
        "tools/blender/vendors.py": vendors,
        "tools/blender/upgrade_boats.py": boats,
        "tools/blender/build.py": people,
    }


def build_people(m, looks, finish):
    """build.py starts every person with lib.reset() (reload of the factory file), which drops the
    window the operators need. So each person takes two timer ticks: reset, then (with the reset
    switched off) build and export."""
    import lib
    reset = lib.reset
    queue = list(looks.items())
    state = {"reset": True, "failed": None}

    def tick():
        if not queue or state["failed"]:
            lib.reset = reset
            finish(state["failed"])
            return None
        if state["reset"]:
            reset()
            state["reset"] = False
            return 1.0
        pid, look = queue.pop(0)
        lib.reset = lambda: None
        try:
            m.build_person(pid, look)
        except BaseException:
            state["failed"] = traceback.format_exc()
        state["reset"] = True
        return 0.2

    bpy.app.timers.register(tick, first_interval=0.2, persistent=True)


def run():
    code = 0
    report = {"ran": {}, "failed": {}, "missing": []}
    try:
        out, names = arguments()
        if not out:
            raise SystemExit("--out DIR is required")
        os.makedirs(out, exist_ok=True)
        # The factory file brings a Cube, a Light and a Camera; the exporters would take the cube along.
        for o in list(bpy.data.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        catalogue = json.load(open(os.path.join(HERE, "assets.json")))["assets"]
        wanted = {
            file: entry
            for file, entry in catalogue.items()
            if entry["source"] != "community"
            and (not names or file in names or entry["group"] in names)
        }
        available = steps(out)
        for source in available:  # dict order: people last
            files = [f for f, e in wanted.items() if e["source"] == source]
            if not files:
                continue
            try:
                result = available[source]()
                if isinstance(result, tuple):  # people: finished in later ticks
                    return build_people(result[1], result[2], lambda err: conclude(report, out, wanted, err))
                report["ran"][source] = result
            except BaseException:
                report["failed"][source] = traceback.format_exc()
        conclude(report, out, wanted, None)
    except BaseException:
        traceback.print_exc()
        print("REBUILD FAILED")
        sys.stdout.flush()
        os._exit(1)


def conclude(report, out, wanted, people_error):
    code = 0
    try:
        if people_error:
            report["failed"]["tools/blender/build.py"] = people_error
        report["missing"] = [f for f in wanted if not os.path.exists(os.path.join(out, f))]
        report["written"] = sorted(f for f in os.listdir(out) if f.endswith(".glb"))
        code = 1 if report["failed"] or report["missing"] else 0
        json.dump(report, open(os.path.join(out, "rebuild-report.json"), "w"), indent=2, default=str)
    except BaseException:
        traceback.print_exc()
        code = 1
    print("REBUILD", "ok" if code == 0 else "FAILED", json.dumps({k: report[k] for k in ("failed", "missing")}, default=str)[:2000])
    sys.stdout.flush()
    os._exit(code)


# The window exists only once Blender's event loop runs.
bpy.app.timers.register(run, first_interval=1.0)
