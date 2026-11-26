import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { launchBrowser } from "./browser.mjs";
import { tap } from "./support/tap.mjs";

// The quests, the event board and the weekly board on the real scene with a fake connection and an
// in-memory economy (the database's rules in memory): the Nhiệm vụ page of the Sổ shows three
// quests with their progress, a finished one is claimed once and pays, the Sự kiện page has its
// board, and the Xếp hạng hub has the "Tuần này" board with the player on it. Needs the dev server.
const browser = await launchBrowser();
const output = process.env.TEST_ARTIFACT_DIR || "test-results";
await mkdir(output, { recursive: true });
const problems = [];

async function open(size) {
  const context = await browser.newContext({ viewport: size });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("GL Driver"))
      problems.push(m.text());
  });
  await page.goto(process.env.TEST_BASE_URL);
  await page.getByRole("button", { name: "Ra khơi" }).waitFor();
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async () => {
    const { startOcean } = await import("/src/app/ocean.ts");
    const { memoryEconomy } = await import("/src/ocean/economy-api.ts");
    const { encodeSave, saveKey } = await import("/src/ocean/save.ts");
    const start = { x: 0, z: 22, heading: 0 };
    localStorage.setItem(
      saveKey("me"),
      encodeSave({ ...start, caught: 0, fish: {} }),
    );
    // Time for the fake economy: the real clock plus a step per catch (one catch per 6 s is the rule).
    const base = Date.now();
    let offset = 0;
    const money = memoryEconomy({ now: () => base + offset });
    window.money = money;
    for (let i = 0; i < 10; i++) {
      offset += 10_000;
      await money.recordCatch({ species: "cua-bien", kg: 1 });
    }
    const connect = async (onBoats) => {
      onBoats(
        [
          {
            uid: "me",
            name: "Tôi",
            session: "s",
            ...start,
            fishing: false,
            updatedAt: Date.now(),
          },
        ],
        Date.now(),
      );
      return {
        uid: "me",
        pose: { ...start, fishing: false },
        dispose() {},
        publish: async () => {},
      };
    };
    window.stop = startOcean(document.querySelector("#app"), () => {}, {
      fightSpeed: 2,
      connect,
      economy: money,
      onScene: (s) => (window.oceanScene = s),
    });
  });
  await page
    .getByText("Đã vào biển chung", { exact: false })
    .waitFor({ timeout: 120000 });
  return { page, context };
}
const inView = async (page, locator) => {
  const box = await locator.boundingBox();
  const { width, height } = page.viewportSize();
  return (
    box &&
    box.x >= 0 &&
    box.y >= 0 &&
    box.x + box.width <= width + 1 &&
    box.y + box.height <= height + 1
  );
};
const shoot = (page, path) => page.screenshot({ path });

try {
  for (const [name, size] of [
    ["844", { width: 844, height: 390 }],
    ["667", { width: 667, height: 375 }],
  ]) {
    const { page, context } = await open(size);
    await tap(page, page.locator('[data-ocean="catch"]'));
    await tap(page, page.locator('.hub-tab[data-hub="book"]'));
    await tap(page, page.locator('.rank-tab[data-page="quests"]'));
    await page.locator(".quest-card").first().waitFor();
    assert.equal(await page.locator(".quest-card").count(), 3, "three quests");
    assert.match(
      await page.locator(".quest-foot").innerText(),
      /Nhiệm vụ mới sau .* Hôm nay còn tối đa 120 xu thưởng/,
    );
    // Ten crabs were caught: the any-fish quest is done and can be claimed (only it, or the crab quest too).
    const ready = page.locator(".quest-card.is-ready");
    assert.ok((await ready.count()) >= 1, "a finished quest waits");
    const claim = page.locator(".quest-claim").first();
    assert.ok(await inView(page, claim), "the Nhận button is on screen");
    const reward = Number(
      (await ready.first().locator(".quest-reward span").innerText()).match(
        /\d+/,
      )[0],
    );
    await shoot(page, `${output}/quests-${name}.png`);
    await tap(page, claim);
    await page.locator(".quest-flash").waitFor();
    assert.match(await page.locator(".quest-flash").innerText(), /^\+\d+ xu$/);
    assert.equal(
      await page.evaluate(async () => (await window.money.state()).coins),
      reward,
      "the reward reached the wallet",
    );
    assert.ok(
      (await page.locator(".quest-card.is-claimed").count()) >= 1,
      "the card is marked claimed",
    );
    // Claiming again is refused by the server: the page has no button for it any more.
    assert.equal(
      await page.locator(".quest-card.is-claimed .quest-claim").count(),
      0,
    );

    // The event page has its board (nobody has a score yet).
    await tap(page, page.locator('.rank-tab[data-page="event"]'));
    await page.locator(".event-board").waitFor();
    await page.locator(".event-board .fish-empty").waitFor();
    assert.match(
      await page.locator(".event-board").innerText(),
      /Bảng xếp hạng sự kiện[\s\S]*Chưa ai có điểm/,
    );
    await shoot(page, `${output}/event-board-${name}.png`);

    // The weekly board: this week's ten crabs, with the player on it.
    await tap(page, page.locator('.hub-tab[data-hub="rank"]'));
    await page.locator(".rank-periods").waitFor();
    assert.ok(
      await inView(page, page.locator('.rank-periods [data-period="week"]')),
      "the week selector is on screen",
    );
    assert.ok(
      await inView(
        page,
        page.locator('.rank-tabs:not(.rank-periods) [data-kind="heaviest"]'),
      ),
      "the board selector is still on screen",
    );
    await tap(page, page.locator('.rank-periods [data-period="week"]'));
    await page.locator(".rank-week-note").waitFor();
    assert.match(
      await page.locator(".rank-week-note").innerText(),
      /Bảng tuần này, còn .*không có thưởng/,
    );
    const mine = page.locator(".rank-row.is-you");
    await mine.first().waitFor();
    assert.match(await mine.first().innerText(), /10/);
    await shoot(page, `${output}/rank-week-${name}.png`);
    await context.close();
  }
  assert.deepEqual(problems, [], "no page errors");
  console.log(
    "Ocean quests: three quests with progress, a finished one is claimed once and paid, the event board, this week's board, small phone fits, no errors.",
  );
} finally {
  await browser.close();
}
