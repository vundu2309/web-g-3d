import assert from "node:assert/strict";
import { launchBrowser } from "./browser.mjs";

// The sea's sound in a real browser: the new layers build without errors, the music plays notes
// once sound is unlocked by a touch and stops when it is switched off in Settings, and opening
// a hub gives its cue. A recording AudioContext stands in for nothing: the real one runs, we only
// count what is created. Real scene, fake connection. Needs the dev server.
const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 844, height: 390 },
  hasTouch: true,
});
const problems = [];
const page = await context.newPage();
page.on("pageerror", (e) => problems.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("GL Driver"))
    problems.push(m.text());
});
// Count the oscillators the game creates and the pitch it gives each.
await page.addInitScript(() => {
  window.__osc = [];
  const create = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function () {
    const osc = create.call(this);
    const entry = { wave: "", freq: 0, at: performance.now() };
    window.__osc.push(entry);
    Object.defineProperty(osc, "type", {
      set(v) {
        entry.wave = v;
      },
      get() {
        return entry.wave;
      },
    });
    const freq = osc.frequency;
    const setValue = Object.getOwnPropertyDescriptor(
      AudioParam.prototype,
      "value",
    ).set;
    Object.defineProperty(freq, "value", {
      set(v) {
        entry.freq = v;
        setValue.call(freq, v);
      },
      get() {
        return entry.freq;
      },
    });
    const at = freq.setValueAtTime.bind(freq);
    freq.setValueAtTime = (v, t) => {
      if (!entry.freq) entry.freq = v;
      return at(v, t);
    };
    return osc;
  };
});
try {
  await page.goto(process.env.TEST_BASE_URL);
  await page.getByRole("button", { name: "Ra khơi" }).waitFor();
  await page.evaluate(async () => {
    localStorage.removeItem("photyphu:audio:v1");
    const { startOcean } = await import("/src/app/ocean.ts");
    const connect = async (onBoats) => {
      onBoats(
        [
          {
            uid: "me",
            name: "Tôi",
            session: "s",
            x: 0,
            z: 0,
            heading: 0,
            fishing: false,
            updatedAt: Date.now(),
          },
        ],
        Date.now(),
      );
      return {
        uid: "me",
        pose: { x: 0, z: 0, heading: 0, fishing: false },
        dispose() {},
        publish: async () => {},
      };
    };
    window.stop = startOcean(document.querySelector("#app"), () => {}, {
      connect,
    });
  });
  await page
    .getByText("Đã vào biển chung", { exact: false })
    .waitFor({ timeout: 120000 });
  // Nothing sounds before the first touch (browsers refuse it).
  assert.equal(
    await page.evaluate(() => window.__osc.length),
    0,
    "no audio before a touch",
  );
  // The first touch unlocks sound; the music starts its first bar and the layers are built.
  await page.mouse.click(420, 200);
  await page.waitForFunction(() => window.__osc.length > 8, null, {
    timeout: 20000,
  });
  const music = () =>
    page.evaluate(
      () =>
        window.__osc.filter((o) => o.wave === "sine" || o.wave === "triangle")
          .length,
    );
  const first = await music();
  assert.ok(first >= 4, `the first bar of music was started (${first})`);

  // Settings has the music switch; the "open" cue sounded when it opened.
  const before = await page.evaluate(() => window.__osc.length);
  const gear = await page.locator('[data-ocean="settings"]').boundingBox();
  await page.mouse.click(gear.x + gear.width / 2, gear.y + gear.height / 2);
  const toggle = page.locator('[data-ocean="audio-music"]');
  await toggle.waitFor();
  assert.match(await toggle.innerText(), /Bật/);
  const opened = await page.evaluate(
    (n) => window.__osc.slice(n).some((o) => Math.abs(o.freq - 392) < 1),
    before,
  );
  assert.ok(opened, "the hub gave its opening cue (a 392 Hz tone)");

  // Switching the music off stops new bars; on again starts them.
  await toggle.click();
  assert.match(await toggle.innerText(), /Tắt/);
  assert.equal(
    JSON.parse(
      await page.evaluate(() => localStorage.getItem("photyphu:audio:v1")),
    ).music,
    false,
    "saved on the device",
  );
  const quiet = await music();
  await page.waitForTimeout(11000); // longer than one bar's lookahead
  assert.equal(await music(), quiet, "no new music notes while it is off");
  await toggle.click();
  await page.waitForFunction(
    (n) =>
      window.__osc.filter((o) => o.wave === "sine" || o.wave === "triangle")
        .length > n,
    quiet,
    { timeout: 20000 },
  );
  assert.deepEqual(problems, []);
  console.log(
    "Ocean audio: nothing before a touch, the music plays and its switch works and is saved, hubs give their cue, no errors.",
  );
} finally {
  await context.close();
  await browser.close();
}
