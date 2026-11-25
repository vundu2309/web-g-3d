import { test } from "node:test";
import assert from "node:assert/strict";
import { PROBES, probe, setProbe } from "../src/ocean/probe.ts";

// The graphics are all on for the player: a switch stored on a device by the old Settings card
// ("Thử tắt từng phần") must not leave a part out, and Settings no longer offers one. The page
// address still works (tests and the render harness use it), and the wave height is still kept.
const withWindow = (search, stored, run) => {
  const saved = globalThis.window;
  const store = { "sea-probe": JSON.stringify(stored) };
  globalThis.window = {
    location: { search },
    localStorage: {
      getItem: (key) => store[key] ?? null,
      setItem: (key, value) => (store[key] = value),
      removeItem: (key) => delete store[key],
    },
  };
  try {
    return run(store);
  } finally {
    globalThis.window = saved;
  }
};

test("old stored switches leave nothing out", () => {
  withWindow(
    "",
    { reflect: "0", fish: "0", props: "0", tiers: "0", yards: "0", scale: "1" },
    () => {
      for (const { name } of PROBES) assert.equal(probe(name), null, name);
    },
  );
});

test("the page address still switches a part off, for tests and the harness", () => {
  withWindow("?fish=0&scale=1", { fish: "1" }, () => {
    assert.equal(probe("fish"), "0");
    assert.equal(probe("scale"), "1");
    assert.equal(probe("reflect"), null);
  });
});

test("the wave height is still kept on the device, and saving it drops the old switches", () => {
  withWindow("", { reflect: "0", waves: "2" }, (store) => {
    assert.equal(probe("waves"), "2");
    setProbe("waves", "3");
    assert.deepEqual(JSON.parse(store["sea-probe"]), { waves: "3" });
  });
});

test("Settings has no card of switches for the player", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (file) =>
    readFileSync(new URL(`../src/app/${file}`, import.meta.url), "utf8");
  assert.ok(!/createProbeSection/.test(read("settings-perf.ts")));
  assert.ok(!/createProbeSection/.test(read("ocean.ts")));
});
