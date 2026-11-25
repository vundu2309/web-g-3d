/**
 * A two-bone arm, as plain numbers (no Babylon, so tests read it): the shoulder `s` is fixed, the
 * upper arm and the forearm keep their lengths, and the wrist is to reach `target`. The elbow
 * bends toward `pole`, a direction kept from the rest pose (outward and down for a rower), so the
 * arm never flips. A target out of reach is clamped to the arm's full length.
 */
export type V3 = readonly [number, number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** The direction the elbow bends in, from a rest pose: the part of (elbow - shoulder) across the shoulder-to-wrist line. */
export function poleOf(shoulder: V3, elbow: V3, wrist: V3): V3 {
  const axis = unit(sub(wrist, shoulder));
  const out = sub(elbow, shoulder);
  return unit(sub(out, mul(axis, dot(out, axis))));
}

/** Where the elbow goes (and the wrist actually ends up) for the wrist target. */
export function solveArm(
  shoulder: V3,
  upper: number,
  fore: number,
  pole: V3,
  target: V3,
): { elbow: V3; wrist: V3 } {
  const to = sub(target, shoulder);
  const reach = Math.min(
    Math.max(len(to), Math.abs(upper - fore) + 1e-4),
    upper + fore - 1e-4,
  );
  const axis = unit(to);
  const a = (upper * upper - fore * fore + reach * reach) / (2 * reach);
  const h = Math.sqrt(Math.max(upper * upper - a * a, 0));
  // The pole, made perpendicular to this axis.
  const across = unit(sub(pole, mul(axis, dot(pole, axis))));
  const elbow = add(add(shoulder, mul(axis, a)), mul(across, h));
  return { elbow, wrist: add(shoulder, mul(axis, reach)) };
}
