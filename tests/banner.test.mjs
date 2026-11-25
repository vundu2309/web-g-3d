import assert from "node:assert/strict";
import test from "node:test";
import {
  BANNER,
  TowTrail,
  bannerLayout,
  fillBanner,
} from "../src/ocean/banner.ts";

const point = () => ({ x: 0, y: 0, z: 0 });

test("a primed trail lies straight behind the plane, at the distance asked", () => {
  const trail = new TowTrail();
  // Heading 0 flies toward -Z, so behind is +Z.
  trail.prime(10, 80, -20, 0);
  const p = trail.behind(30, point());
  assert.ok(Math.abs(p.x - 10) < 1e-9 && Math.abs(p.y - 80) < 1e-9);
  assert.ok(Math.abs(p.z - (-20 + 30)) < 1e-9);
  // Past the end of the stored path it carries straight on.
  const far = trail.behind(500, point());
  assert.ok(Math.abs(far.z - (-20 + 500)) < 1e-6);
  const zero = trail.behind(0, point());
  assert.ok(Math.abs(zero.z - -20) < 1e-9);
});

test("the trail follows the path flown, not the present heading: a turn leaves a curve behind", () => {
  const trail = new TowTrail();
  trail.prime(0, 50, 0, 0);
  // Fly 60 m to -Z, then 20 m to +X.
  let x = 0;
  let z = 0;
  for (let i = 0; i < 30; i++) {
    z -= 2;
    trail.push(x, 50, z);
  }
  for (let i = 0; i < 10; i++) {
    x += 2;
    trail.push(x, 50, z);
  }
  const near = trail.behind(15, point());
  assert.ok(
    Math.abs(near.z - z) < 1e-6 && Math.abs(near.x - (x - 15)) < 1e-6,
    "15 m back is still on the last leg",
  );
  const round = trail.behind(35, point());
  assert.ok(
    Math.abs(round.x - 0) < 1e-6 && Math.abs(round.z - (z + 15)) < 1e-6,
    "35 m back is 15 m round the corner, on the first leg",
  );
});

test("the trail keeps only as much path as the tow needs", () => {
  const trail = new TowTrail();
  trail.prime(0, 50, 0, 0);
  for (let i = 0; i < 5000; i++) trail.push(0, 50, -i * 0.5);
  // (a private list: the check is that the hung rows are still on the path, not extrapolated)
  const end = trail.behind(BANNER.tail + BANNER.rope + BANNER.length, point());
  assert.ok(
    Math.abs(
      end.z - (-4999 * 0.5 + BANNER.tail + BANNER.rope + BANNER.length),
    ) < 1e-6,
  );
});

test("the layout is one mesh: a thin rope then the banner, both faces, no face joins rope to banner", () => {
  const layout = bannerLayout();
  assert.equal(
    layout.rows.length,
    BANNER.ropeSegments + 1 + BANNER.segments + 1,
  );
  assert.equal(layout.vertices, layout.rows.length * 4);
  assert.equal(layout.uvs.length, layout.vertices * 2);
  const faces = layout.indices.length / 3;
  assert.equal(faces, 2 * 2 * (BANNER.ropeSegments + BANNER.segments));
  assert.ok(faces <= 80, "a banner is a few dozen triangles");
  for (const index of layout.indices)
    assert.ok(index >= 0 && index < layout.vertices);
  // Each face reads correctly from the side it is seen from: the texture runs from the plane's end on one face and from the free end on the other (checked by eye in the browser test's screenshots).
  const u = (face, row) => layout.uvs[(face * layout.half + row * 2) * 2];
  const first = layout.rows.findIndex((r) => !r.rope);
  const last = layout.rows.length - 1;
  assert.equal(u(0, first), 1);
  assert.equal(u(0, last), 0);
  assert.equal(u(1, first), 0);
  assert.equal(u(1, last), 1);
});

test("filled, the banner hangs from the rope's end behind the plane and is as long and as high as asked", () => {
  const layout = bannerLayout();
  const trail = new TowTrail();
  trail.prime(0, 80, 0, 0);
  const out = new Float32Array(layout.vertices * 3);
  fillBanner(layout, trail, 0, out);
  const row = (r, face = 0) => {
    const i = (face * layout.half + r * 2) * 3;
    return {
      top: [out[i], out[i + 1], out[i + 2]],
      bottom: [out[i + 3], out[i + 4], out[i + 5]],
    };
  };
  const first = layout.rows.findIndex((r) => !r.rope);
  const start = row(first);
  assert.ok(
    Math.abs(start.top[2] - (BANNER.tail + BANNER.rope)) < 1e-4,
    "starts a rope's length behind the tail",
  );
  assert.ok(
    Math.abs(start.top[1] - start.bottom[1] - BANNER.height) < 1e-4,
    "is as high as asked",
  );
  const end = row(layout.rows.length - 1);
  assert.ok(
    end.top[2] - start.top[2] > BANNER.length - 1,
    "is about as long as asked",
  );
  // The two faces sit on the same places.
  assert.deepEqual(row(first, 1), row(first, 0));
  // The rope is thin and starts at the tail.
  const rope = row(0);
  assert.ok(Math.abs(rope.top[1] - rope.bottom[1] - BANNER.ropeThick) < 1e-4);
  assert.ok(Math.abs(rope.top[2] - BANNER.tail) < 1e-4);
});

test("the free end flutters and sags while the end at the rope stays put", () => {
  const layout = bannerLayout();
  const trail = new TowTrail();
  trail.prime(0, 80, 0, 0);
  const a = new Float32Array(layout.vertices * 3);
  const b = new Float32Array(layout.vertices * 3);
  fillBanner(layout, trail, 0, a);
  fillBanner(layout, trail, 0.3, b);
  const first = layout.rows.findIndex((r) => !r.rope);
  const last = layout.rows.length - 1;
  const at = (arr, r) => r * 2 * 3;
  assert.equal(
    a[at(a, first)],
    b[at(b, first)],
    "the end at the rope does not flutter",
  );
  assert.notEqual(a[at(a, last)], b[at(b, last)], "the free end does");
  assert.ok(
    a[at(a, last) + 1] < 80 + BANNER.height / 2 - 0.5,
    "the free end sags",
  );
  // Flutter stays small: it never throws the banner out of its place by more than the amplitude.
  for (let t = 0; t < 10; t += 0.1) {
    fillBanner(layout, trail, t, a);
    assert.ok(Math.abs(a[at(a, last)]) <= BANNER.flutter + 1e-4);
  }
});
