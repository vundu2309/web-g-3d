import assert from "node:assert/strict";
import test from "node:test";

const { checkForUpdate } = await import("../src/platform/update-check.ts");

/** A worker whose state the test moves, announcing each change like a real one. */
function worker(state = "installing") {
  const target = new EventTarget();
  return {
    state,
    addEventListener: (type, listener) =>
      target.addEventListener(type, listener),
    removeEventListener: (type, listener) =>
      target.removeEventListener(type, listener),
    move(next) {
      this.state = next;
      target.dispatchEvent(new Event("statechange"));
    },
  };
}
const registration = ({ installing = null, waiting = null, fail } = {}) => ({
  installing,
  waiting,
  update: async () => {
    if (fail) throw new Error("offline");
  },
});

test("an update check that cannot reach the server is a failure, not 'up to date'", async () => {
  assert.equal(await checkForUpdate(registration({ fail: true })), "failed");
});

test("nothing newer than what runs is reported as the latest version", async () => {
  assert.equal(await checkForUpdate(registration()), "latest");
});

test("a downloaded version waiting for a reload is ready", async () => {
  assert.equal(
    await checkForUpdate(registration({ waiting: worker("installed") })),
    "ready",
  );
});

test("a version that already took over while this page still runs the old one is ready", async () => {
  assert.equal(
    await checkForUpdate(registration(), { pending: () => true }),
    "ready",
  );
});

test("a version still downloading is waited for, then reported", async () => {
  for (const finished of ["installed", "activated"]) {
    const next = worker();
    const result = checkForUpdate(registration({ installing: next }));
    next.move("installing");
    next.move(finished);
    assert.equal(await result, "ready", finished);
  }
});

test("a version whose files did not all download is a failure", async () => {
  const next = worker();
  const result = checkForUpdate(registration({ installing: next }));
  next.move("redundant");
  assert.equal(await result, "failed");
});

test("a download that never finishes gives up instead of hanging the button", async () => {
  const result = await checkForUpdate(registration({ installing: worker() }), {
    settleMs: 20,
  });
  assert.equal(result, "failed");
});

test("a worker that is already installed when the check returns is not waited for", async () => {
  assert.equal(
    await checkForUpdate(registration({ installing: worker("activated") }), {
      settleMs: 20,
    }),
    "ready",
  );
});
