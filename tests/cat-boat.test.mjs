import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Axis } from "@babylonjs/core/Maths/math.axis.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { RIG, STROKE, oarQuaternion, stroke } from "../src/ocean/cat-boat.ts";

const glbJson = (file) => {
  const buf = readFileSync(
    new URL(`../public/models/${file}`, import.meta.url),
  );
  assert.equal(buf.toString("utf8", 0, 4), "glTF");
  const length = buf.readUInt32LE(12);
  return JSON.parse(buf.toString("utf8", 20, 20 + length));
};

test("the stroke is periodic; the blade is in the water and square in the drive, out and flat in the recovery", () => {
  const a = stroke(0.3);
  const b = stroke(1.3);
  for (const k of ["sweep", "lift", "feather", "lean"])
    assert.ok(Math.abs(a[k] - b[k]) < 1e-9, k);
  const drive = stroke(0.25);
  const recovery = stroke(0.75);
  assert.ok(drive.lift < 0 && drive.feather === 0);
  assert.ok(
    recovery.lift > 0 && Math.abs(recovery.feather - Math.PI / 2) < 1e-9,
  );
  const catchPose = stroke(0);
  assert.ok(
    catchPose.sweep > 0.4 && catchPose.lean > 0.15,
    "blades forward, cats leaning to the stern",
  );
  assert.ok(STROKE > 1);
});

test("oarQuaternion applies the roll about X first, then the pitch about Z, then the yaw about Y", () => {
  const apply = (q, p) => p.clone().rotateByQuaternionToRef(q, new Vector3());
  const p = new Vector3(0.3, 0.7, -0.5);
  const roll = 0.9;
  const pitch = -0.2;
  const yaw = 0.45;
  const step = apply(
    Quaternion.RotationAxis(Axis.Y, yaw),
    apply(
      Quaternion.RotationAxis(Axis.Z, pitch),
      apply(Quaternion.RotationAxis(Axis.X, roll), p),
    ),
  );
  const whole = apply(oarQuaternion(yaw, pitch, roll), p);
  assert.ok(Vector3.Distance(step, whole) < 1e-6, `${step} vs ${whole}`);
});

test("a positive sweep swings a starboard blade toward the bow (-Z) and a port blade too", () => {
  const apply = (q, p) => p.clone().rotateByQuaternionToRef(q, new Vector3());
  const star = apply(oarQuaternion(0.4, 0, 0), new Vector3(2, 0, 0));
  const port = apply(oarQuaternion(-0.4, 0, 0), new Vector3(-2, 0, 0));
  assert.ok(star.z < -0.5, `starboard blade z ${star.z}`);
  assert.ok(port.z < -0.5, `port blade z ${port.z}`);
});

test("the rig matches the models: paws sit on the oar handle at the Blender rest pose", () => {
  // The cat's own frame: ginger at x +0.30 rows the starboard oar at x +0.72: left paw 0.24 inboard.
  const lock = RIG.oarlocks.starboard[0] - RIG.seats.ginger[0];
  assert.ok(Math.abs(lock - RIG.grip.outboard - 0.18) < 1e-9);
  assert.ok(Math.abs(lock - RIG.grip.inboard - 0.06) < 1e-9);
  assert.ok(
    Math.abs(RIG.oarlocks.starboard[1] - RIG.seats.ginger[1] - 0.378) < 1e-9,
  );
});

test("the exported models have the nodes the game loads", () => {
  for (const id of ["ginger", "grey"]) {
    const json = glbJson(`rower-${id}.glb`);
    const names = json.nodes.map((n) => n.name);
    for (const name of [
      `rower-${id}`,
      "body",
      "head",
      "tail",
      "arm-left",
      "arm-right",
      "fore-left",
      "fore-right",
    ])
      assert.ok(names.includes(name), `${id}: ${name}`);
    for (const n of json.nodes)
      assert.ok((!n.scale && !n.rotation) || n.name !== `rower-${id}`);
  }
  assert.ok(
    glbJson("rower-oar-starboard.glb").nodes.some((n) => n.name === "oar"),
  );
  assert.ok(glbJson("rower-oar-port.glb").nodes.some((n) => n.name === "oar"));
  assert.ok(glbJson("rowboat.glb").nodes.some((n) => n.name === "hull"));
});

test("the lantern model is a post and a glass, and the light hangs where the glass is", async () => {
  const { LANTERN } = await import("../src/ocean/cat-lantern.ts");
  const json = glbJson("rower-lantern.glb");
  const names = json.nodes.map((n) => n.name);
  for (const name of ["rower-lantern", "post", "glass"])
    assert.ok(names.includes(name), name);
  const root = json.nodes.find((n) => n.name === "rower-lantern");
  assert.ok(!root.translation && !root.rotation && !root.scale);
  // The glass's own box, from its accessor bounds: the light is at its centre.
  const node = json.nodes.find((n) => n.name === "glass");
  const mesh = json.meshes[node.mesh];
  const accessor = json.accessors[mesh.primitives[0].attributes.POSITION];
  const mid = accessor.min.map((lo, k) => (lo + accessor.max[k]) / 2);
  assert.ok(Math.abs(mid[0] - LANTERN.at.x) < 0.02, `x ${mid[0]}`);
  assert.ok(Math.abs(mid[1] - LANTERN.at.y) < 0.02, `y ${mid[1]}`);
  assert.ok(Math.abs(mid[2] - LANTERN.at.z) < 0.02, `z ${mid[2]}`);
  assert.ok(
    LANTERN.at.z < -1 && LANTERN.at.y > 0.8,
    "on the bow, above the gunwale",
  );
});
