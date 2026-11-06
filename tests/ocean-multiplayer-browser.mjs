import assert from "node:assert/strict";
import { createApi } from "../server/app.mjs";
import { launchBrowser } from "./browser.mjs";
import {
  API_PORT,
  seedSession,
  startSupabaseDev,
} from "./support/supabase-dev.mjs";

// Real clients, real server code. Players must find each other: both enter, both
// count two boats, each has the other on screen or marked by an arrow, and a player
// who steers away still gets an arrow with the distance. A revoked session is
// reported at once instead of being retried, and a second window of the same
// account says so. Only Supabase Auth is faked (a local token table).
const { vite, origin } = await startSupabaseDev();
const users = {
  "tok-an": { id: "user-an", user_metadata: { display_name: "An" } },
  "tok-binh": { id: "user-binh", user_metadata: { display_name: "Bình" } },
};
const checks = new Map();
const api = createApi({
  url: "http://auth.test",
  key: "k",
  origins: [origin],
  ready: () => true,
  request: async (_url, init) => {
    const token = String(init?.headers?.Authorization || "").replace(
      "Bearer ",
      "",
    );
    checks.set(token, (checks.get(token) || 0) + 1);
    const user = users[token];
    return new Response(
      JSON.stringify(user || { error: "session_not_found" }),
      {
        status: user ? 200 : 403,
      },
    );
  },
});
await new Promise((resolve) => api.listen(API_PORT, "127.0.0.1", resolve));
const browser = await launchBrowser();
const problems = [];
async function player(token, id, name) {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
  });
  await seedSession(context, { token, id, name });
  const page = await context.newPage();
  page.on("pageerror", (error) => problems.push(`${name}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("GL Driver"))
      problems.push(`${name}: ${message.text()}`);
  });
  await page.goto(`${origin}/?view=ocean`);
  return { page, context, name };
}
const crew = (p) =>
  p.page.evaluate(() => ({
    count: document.querySelector("[data-count]").textContent,
    labels: [
      ...document.querySelectorAll(".ocean-boat-label:not(.is-self)"),
    ].map((l) => ({
      name: l.textContent,
      hidden: l.hidden,
      edge: l.dataset.edge === "true",
      distance: l.dataset.distance,
      x: l.dataset.x,
      z: l.dataset.z,
    })),
  }));
try {
  const an = await player("tok-an", "user-an", "An");
  const binh = await player("tok-binh", "user-binh", "Bình");
  for (const p of [an, binh])
    await p.page
      .getByText("Đã vào biển chung", { exact: false })
      .waitFor({ timeout: 120000 });

  // Each side counts both boats and can find the other: on screen or by arrow.
  for (const [me, other] of [
    [an, binh],
    [binh, an],
  ]) {
    await me.page.waitForFunction(
      (name) =>
        document.querySelector("[data-count]").textContent === "2 thuyền" &&
        [...document.querySelectorAll(".ocean-boat-label:not(.is-self)")].some(
          (l) => l.textContent === name && !l.hidden,
        ),
      other.name,
      { timeout: 60000 },
    );
  }
  const a = await crew(an);
  const b = await crew(binh);
  assert.equal(a.labels.length, 1);
  assert.equal(b.labels.length, 1);
  const apart = Math.hypot(
    Number(a.labels[0].x) - Number(b.labels[0].x),
    Number(a.labels[0].z) - Number(b.labels[0].z),
  );
  assert.ok(
    apart < 30,
    `the two players start ${apart.toFixed(1)} m apart, in one harbor`,
  );

  // Steer An in a circle until Bình leaves the view: an arrow with a distance appears.
  await an.page.keyboard.down("ArrowUp");
  await an.page.keyboard.down("ArrowRight");
  await an.page.waitForFunction(
    () => {
      const mark = document.querySelector(".ocean-boat-label[data-edge]");
      return (
        mark &&
        !mark.hidden &&
        /^\d+ m$/.test(mark.dataset.distance) &&
        mark.style.getPropertyValue("--turn").endsWith("rad")
      );
    },
    null,
    { timeout: 90000 },
  );
  await an.page.keyboard.up("ArrowUp");
  await an.page.keyboard.up("ArrowRight");
  const marked = await crew(an);
  assert.ok(
    marked.labels.some((l) => l.edge && l.name === "Bình"),
    "the arrow names the player it points to",
  );

  // A revoked session is told at once, with a way to sign in again, and is not retried in a loop.
  const dead = await player("tok-dead", "user-dead", "Ma");
  await dead.page
    .getByText("Chưa vào được biển chung", { exact: true })
    .waitFor({ timeout: 90000 });
  await dead.page
    .getByRole("button", { name: "Đăng nhập lại", exact: true })
    .waitFor();
  assert.ok(
    (checks.get("tok-dead") || 0) <= 3,
    `the dead session was checked ${checks.get("tok-dead")} times, not retried in a loop`,
  );

  // The same account in a second window takes over; the first one is told why.
  const twin = await player("tok-an", "user-an", "An");
  await twin.page
    .getByText("Đã vào biển chung", { exact: false })
    .waitFor({ timeout: 120000 });
  await an.page
    .getByText("cửa sổ khác", { exact: false })
    .first()
    .waitFor({ timeout: 60000 });
  assert.deepEqual(problems, []);
  console.log(
    `Ocean multiplayer: two real clients see each other (${apart.toFixed(1)} m apart at the start), arrow with distance when out of view, revoked session reported once, same-account takeover explained.`,
  );
} finally {
  await browser.close();
  api.io.close();
  api.close();
  await vite.close();
}
