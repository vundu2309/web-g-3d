import test from "node:test";
import assert from "node:assert/strict";
import {
  allowed,
  bidTotal,
  scenarioById,
  scenarios,
} from "../src/game-ui/model.ts";

test("observers have no gameplay actions, respondents only get the current task", () => {
  for (const state of scenarios.filter((s) => s.observer)) {
    assert.deepEqual(state.actions, [], state.name);
    for (const action of ["assets", "trade", "roll", "buy", "accept", "bid10"])
      assert.equal(allowed(state, action), false, `${state.name}/${action}`);
  }
  const auction = scenarioById(5);
  assert.equal(auction.active, 1);
  assert.equal(auction.responder, 0);
  assert.equal(allowed(auction, "bid10"), true);
  assert.equal(allowed(auction, "trade"), false);
  assert.equal(allowed(scenarioById(10), "accept"), true);
  assert.equal(allowed(scenarioById(3), "roll"), false);
});

test("auction steps use highest bid rather than the local previous amount", () => {
  assert.equal(bidTotal(120, "bid10"), 130);
  assert.equal(bidTotal(120, "bid20"), 140);
  assert.equal(bidTotal(120, "bid50"), 170);
  assert.equal(bidTotal(170, "bid10"), 180);
  assert.equal(bidTotal(-1, "bid10"), null);
  assert.equal(bidTotal(120, "buy"), null);
  assert.equal(bidTotal(Number.MAX_SAFE_INTEGER, "bid50"), null);
});

test("moving state has no status text or action, and doubles have no end-turn", () => {
  assert.equal(scenarioById(2).title, "");
  assert.equal(scenarioById(2).detail, undefined);
  assert.deepEqual(scenarioById(2).actions, []);
  assert.equal(allowed(scenarioById(20), "end"), false);
  assert.equal(allowed(scenarioById(20), "roll"), true);
  assert.equal(new Set(scenarios.map((s) => s.id)).size, 24);
});
