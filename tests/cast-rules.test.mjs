import assert from "node:assert/strict";
import test from "node:test";

const { pressAction, castLook, FIZZLE_MS } = await import(
  "../src/ocean/cast-rules.ts"
);
const { Angler, CHARGE_MS, castTarget, castDirection, CAST_MIN } = await import(
  "../src/ocean/fishing.ts"
);

// "Không ném được cần": what a press of the fishing button does (src/ocean/cast-rules.ts, applied by
// src/app/fishing-ui.ts), and the one place where the press used to be swallowed.
const ready = { enabled: true, holdingFish: false, busy: false, hasRod: true };

test("an idle press with the rod ready charges the throw", () => {
  assert.equal(pressAction(ready), "charge");
});

test("a press while a landed fish hangs keeps it AND charges the next throw", () => {
  assert.equal(pressAction({ ...ready, holdingFish: true }), "keep-and-charge");
  // Even if the angler is somehow not idle: the fish is dealt with first, the press is never lost.
  assert.equal(
    pressAction({ ...ready, holdingFish: true, busy: true }),
    "keep-and-charge",
  );
  assert.equal(
    pressAction({ ...ready, holdingFish: true, hasRod: false }),
    "keep",
  );
});

test("a press while a line is out or a fish is on pulls; a press that is not allowed does nothing", () => {
  assert.equal(pressAction({ ...ready, busy: true }), "pull");
  assert.equal(pressAction({ ...ready, enabled: false }), "ignore");
  assert.equal(
    pressAction({ ...ready, enabled: false, holdingFish: true }),
    "ignore",
    "a fish is not kept by a press the sea refuses (a dialog is open)",
  );
  assert.equal(pressAction({ ...ready, hasRod: false }), "ignore");
});

test("the throw preview names a throw that cannot land", () => {
  assert.equal(castLook({ water: false, sweet: true }), "blocked");
  assert.equal(castLook({ water: true, sweet: true }), "sweet");
  assert.equal(castLook({ water: true, sweet: false }), "open");
  assert.ok(FIZZLE_MS >= 800, "long enough to be seen on a slow frame");
});

test("the power of a charge is never negative (a frame that started before the press)", () => {
  const events = [];
  const angler = new Angler(
    (e) => events.push(e.type),
    () => 0.5,
  );
  angler.startCharge(1000);
  // The frame's own clock can be a little earlier than the press that happened during it.
  assert.equal(angler.power(990), 0);
  assert.equal(angler.view(990).power, 0);
  assert.ok(angler.power(1000 + CHARGE_MS / 2) > 0.45);
  assert.equal(angler.power(1000 + CHARGE_MS * 3), 1);
});

test("a quick tap throws the shortest throw from open water, and facing an island it fizzles", () => {
  const events = [];
  const angler = new Angler(
    (e) => events.push(e.type),
    () => 0.5,
  );
  // The harbor, bow to the north (heading 0), the rod's tip a little to starboard and aft.
  const tip = { x: 1.3, z: 24.5 };
  angler.startCharge(5000);
  angler.release(5000, tip, castDirection(0));
  assert.equal(angler.fishing, true, "a quick tap from the harbor throws");
  assert.deepEqual(events, []);
  // By island 0 (-68, -65), 39 m from its centre, heading west: the sand is where the lure lands.
  const near = { x: -68 + 39 + 2.5, z: -65 };
  const target = castTarget(near, castDirection(-Math.PI / 2), 0.5);
  assert.equal(target.water, false);
  assert.equal(castLook(target), "blocked");
  assert.ok(
    castTarget(near, castDirection(Math.PI / 2), 0.5).water,
    "away from it it lands",
  );
  const second = new Angler(
    (e) => events.push(e.type),
    () => 0.5,
  );
  second.startCharge(0);
  second.release(CHARGE_MS / 2, near, castDirection(-Math.PI / 2));
  assert.deepEqual(events, ["fizzle"]);
  assert.equal(
    second.busy,
    false,
    "a fizzle leaves the button ready for the next try",
  );
  assert.ok(CAST_MIN > 0);
});
