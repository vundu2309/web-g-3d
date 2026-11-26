import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { launchBrowser } from "./browser.mjs";
import { tap } from "./support/tap.mjs";
import { FAST_SEA } from "./support/fast-sea.mjs";

// The Xếp hạng hub on the real scene with a fake connection: it is a tab of the hub rail (reached
// from the fish store), shows the server's two boards as numbered rows with the player's own row
// marked, tells the player their place when it is below the 20 shown, shows an empty board, a
// failure with a way to retry, and is not there at all without a server economy. Needs the dev
// server.
const browser = await launchBrowser();
const output = process.env.TEST_ARTIFACT_DIR || "test-results";
await mkdir(output, { recursive: true });
const problems = [];

async function open({
  economy = true,
  board = "full",
  size = { width: 844, height: 390 },
} = {}) {
  const context = await browser.newContext({ viewport: size });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("GL Driver"))
      problems.push(m.text());
  });
  await page.goto(`${process.env.TEST_BASE_URL}?fast=1${FAST_SEA}`);
  await page.getByRole("button", { name: "Ra khơi" }).waitFor();
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(
    async ({ economy, board }) => {
      const { startOcean } = await import("/src/app/ocean.ts");
      const { memoryEconomy } = await import("/src/ocean/economy-api.ts");
      const start = { x: 0, z: 22, heading: 0 };
      const rows = (kind) =>
        Array.from({ length: 20 }, (_, i) => ({
          rank: i + 1,
          name: i === 1 ? "<b>Bình</b>" : `Cá thủ ${i + 1}`,
          value: kind === "caught" ? 200 - i : 150 - i * 2.5,
          ...(kind === "heaviest" ? { species: "rua-bien" } : {}),
          you: false,
        }));
      const answers = {
        // The player is 31st of 40 on one board and not on the other.
        full: {
          caught: {
            players: 40,
            top: rows("caught"),
            me: { rank: 31, value: 12 },
          },
          heaviest: { players: 3, top: rows("heaviest").slice(0, 3) },
        },
        // The player is on the top of the heaviest board.
        mine: {
          caught: { players: 0, top: [] },
          heaviest: {
            players: 1,
            top: [
              {
                rank: 1,
                name: "Tôi",
                value: 31.5,
                species: "rua-bien",
                you: true,
              },
            ],
            me: { rank: 1, value: 31.5, species: "rua-bien" },
          },
        },
        empty: {
          caught: { players: 0, top: [] },
          heaviest: { players: 0, top: [] },
        },
      };
      const money = memoryEconomy();
      window.asks = 0;
      window.broken = board === "broken";
      const fake = {
        ...money,
        async leaderboard() {
          window.asks++;
          if (window.broken) {
            const { EconomyError } = await import("/src/ocean/economy-api.ts");
            throw new EconomyError("network");
          }
          const { readLeaderboard } = await import("/src/ocean/leaderboard.ts");
          return readLeaderboard(answers[board] ?? answers.empty);
        },
      };
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
        economy: economy ? fake : undefined,
      });
    },
    { economy, board },
  );
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
const rankTab = (page) => page.locator('.hub-tab[data-hub="rank"]');
const openRank = async (page) => {
  await tap(page, page.locator('[data-ocean="catch"]'));
  await rankTab(page).waitFor();
  await tap(page, rankTab(page));
  await page.locator(".is-rank .fish-store-head h2").waitFor();
};

try {
  // 1. The tab is on the rail of the fish store; the page lists the boards.
  {
    const { page, context } = await open();
    await openRank(page);
    assert.match(
      await page.locator(".fish-store-head h2").innerText(),
      /Xếp hạng/,
    );
    await page.locator(".rank-row").first().waitFor();
    assert.equal(await page.locator(".rank-row").count(), 20, "20 rows");
    assert.equal(
      await page
        .locator(".rank-tab[data-kind][aria-selected=true]")
        .innerText(),
      "Câu nhiều nhất",
    );
    // Names are text: a tag in a name never becomes an element.
    assert.equal(
      await page
        .locator(".rank-row strong", { hasText: "<b>Bình</b>" })
        .count(),
      1,
    );
    assert.equal(await page.locator(".rank-row b").count(), 0);
    assert.match(
      await page.locator(".rank-row .rank-value").first().innerText(),
      /^200 con$/,
    );
    // Below the top 20: the foot line names the player's place.
    assert.match(
      await page.locator(".rank-foot").innerText(),
      /Bạn đứng hạng 31/,
    );
    assert.match(await page.locator(".rank-foot").innerText(), /12 con/);
    assert.match(await page.locator(".rank-foot").innerText(), /40 người/);
    assert.ok(
      await inView(page, page.locator(".rank-foot")),
      "foot line on screen",
    );
    await page.screenshot({ path: `${output}/rank-caught.png` });
    // The second board: the heaviest fish, with its species and weight; the player is not on it.
    await tap(page, page.locator(".rank-tab", { hasText: "Cá nặng nhất" }));
    await page.waitForFunction(
      () => document.querySelectorAll(".rank-row").length === 3,
    );
    assert.match(
      await page.locator(".rank-row small").first().innerText(),
      /Rùa biển/,
    );
    assert.match(
      await page.locator(".rank-row .rank-value").first().innerText(),
      /^150 kg$/,
    );
    assert.match(await page.locator(".rank-foot").innerText(), /chưa có tên/);
    await page.screenshot({ path: `${output}/rank-heaviest.png` });
    // The rail still leads away: back to the fish store.
    await tap(page, page.locator('.hub-tab[data-hub="stock"]'));
    await page.locator(".is-stock .fish-store-head h2").waitFor();
    await page.locator(".fish-store-close").click();
    await page.waitForFunction(() => !document.querySelector("dialog[open]"));
    await context.close();
  }
  // 2. The player is on the top: their row is marked and there is no foot line.
  {
    const { page, context } = await open({ board: "mine" });
    await openRank(page);
    await page.locator(".rank-tab", { hasText: "Cá nặng nhất" }).click();
    await page.locator(".rank-row.is-you").waitFor();
    assert.equal(
      await page.locator(".rank-row.is-you .crew-you").innerText(),
      "Bạn",
    );
    assert.match(
      await page.locator(".rank-row .rank-value").innerText(),
      /^31,5 kg$/,
    );
    assert.equal(
      await page.locator(".rank-foot").isHidden(),
      true,
      "no foot line",
    );
    await context.close();
  }
  // 3. An empty board says so; a failed read says so and can be retried.
  {
    const { page, context } = await open({ board: "empty" });
    await openRank(page);
    // (while the answer is awaited the page says it is loading; then the empty board's words)
    await page.getByText("Chưa ai câu được cá").waitFor();
    await context.close();
  }
  {
    const { page, context } = await open({ board: "broken" });
    await openRank(page);
    await page.locator(".market-error").waitFor();
    assert.match(
      await page.locator(".market-error").innerText(),
      /Chưa tải được/,
    );
    assert.equal(await page.evaluate(() => window.asks), 1);
    // The server answers again: "Thử lại" asks once more and draws the (empty) board.
    await page.evaluate(() => (window.broken = false));
    await tap(page, page.locator(".rank-retry"));
    await page.getByText("Chưa ai câu được cá").waitFor();
    assert.equal(await page.evaluate(() => window.asks), 2);
    await context.close();
  }
  // 4. Without a server economy there is no tab.
  {
    const { page, context } = await open({ economy: false });
    await tap(page, page.locator('[data-ocean="catch"]'));
    await page.locator(".hub-rail").waitFor();
    assert.equal(await rankTab(page).count(), 0, "no tab without an economy");
    await context.close();
  }
  // 5. A small phone: the rail with every tab, the tabs and the rows still fit.
  {
    const { page, context } = await open({ size: { width: 667, height: 375 } });
    await openRank(page);
    await page.locator(".rank-row").first().waitFor();
    assert.ok(
      await inView(page, page.locator(".fish-store-close")),
      "the X fits 667x375",
    );
    assert.ok(
      await inView(page, page.locator(".rank-tab").last()),
      "the tabs fit",
    );
    assert.ok(
      await inView(page, page.locator(".rank-foot")),
      "the foot line fits",
    );
    await page.screenshot({ path: `${output}/rank-667.png` });
    await context.close();
  }
  assert.deepEqual(problems, [], `no page errors: ${problems.join("; ")}`);
  console.log(
    "Ocean rank: the tab opens the boards, names are text, the player's own place shows on and below the top, empty and failed states, no tab without an economy, small phone fits, no errors.",
  );
} finally {
  await browser.close();
}
