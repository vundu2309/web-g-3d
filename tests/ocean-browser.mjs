import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { launchBrowser } from "./browser.mjs";
import { tap } from "./support/tap.mjs";
import { fightBot } from "./support/fight-bot.mjs";
const browser = await launchBrowser();
const contexts = [];
const errors = [];
const base = process.env.TEST_BASE_URL;
async function player(name, email) {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
  });
  contexts.push(context);
  await context.route(
    /https:\/\/(identitytoolkit|securetoken)\.googleapis\.com|https:\/\/firestore\.googleapis\.com/,
    (route) => {
      errors.push("Production request");
      return route.abort();
    },
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error")
      console.error("ocean console:", message.text());
  });
  page.on("response", async (response) => {
    if (response.status() >= 400) {
      const url = new URL(response.url());
      console.error("Ocean HTTP", response.status(), url.pathname);
      if (url.pathname.startsWith("/src/"))
        console.error(await response.text());
    }
  });
  await page.goto(base);
  assert.equal(
    await page.getByRole("button", { name: "Tạo phòng", exact: true }).count(),
    0,
  );
  await page.locator('[data-harbor="play"]').click();
  await page
    .getByRole("button", { name: "Chưa có tài khoản? Đăng ký" })
    .click();
  await page.getByLabel("Tên người chơi", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("GameTest-123!");
  await page
    .getByRole("button", { name: "Tạo tài khoản", exact: true })
    .click();
  try {
    await page.getByText("Đã vào biển chung.", { exact: false }).waitFor();
  } catch (error) {
    console.error(
      "Ocean entry body:",
      await page.locator("body").innerText(),
      errors,
    );
    await page.screenshot({ path: "test-results/ocean-entry-failed.png" });
    throw error;
  }
  await page.locator(".ocean-boat-label.is-self").waitFor();
  console.log("Ocean player entered:", name);
  return page;
}
async function boatData(page) {
  return page.locator(".ocean-boat-label.is-self").evaluate((label) => ({
    x: Number(label.dataset.x),
    z: Number(label.dataset.z),
    uid: label.dataset.uid,
  }));
}

try {
  await mkdir("test-results", { recursive: true });
  const host = await player("Biển Minh", "ocean-minh@example.test");
  const guest = await player("Lan <b>", "ocean-lan@example.test");
  await host.getByText("2 thuyền", { exact: true }).waitFor();
  await guest.getByText("2 thuyền", { exact: true }).waitFor();
  await tap(host, host.getByRole("button", { name: "Thuyền trong kênh" }));
  await host.getByRole("listitem").filter({ hasText: "Lan <b>" }).waitFor();
  assert.equal(await host.locator("dialog li b").count(), 0);
  await host.getByRole("button", { name: "Đóng", exact: true }).click();
  console.log("Ocean both boats visible");
  const before = await boatData(host);
  await host.bringToFront();
  await host.keyboard.down("w");
  await host.waitForFunction(({ x, z }) => {
    const label = document.querySelector(".ocean-boat-label.is-self");
    return (
      label &&
      Math.hypot(Number(label.dataset.x) - x, Number(label.dataset.z) - z) > 4
    );
  }, before);

  await host.keyboard.up("w");
  await host.waitForTimeout(1200);
  const after = await boatData(host);
  console.log("Ocean motion", { before, after });
  assert.ok(
    Math.hypot(after.x - before.x, after.z - before.z) > 3,
    "movement reaches shared Firestore state",
  );
  // Read the same authoritative emulator document from the other account.
  const uid = after.uid;
  await guest.bringToFront();
  await guest.waitForFunction(
    ({ uid, x, z }) => {
      const label = document.querySelector(`[data-uid="${uid}"]`);
      return (
        label &&
        Math.hypot(Number(label.dataset.x) - x, Number(label.dataset.z) - z) < 1
      );
    },
    { uid, x: after.x, z: after.z },
  );
  console.log("Ocean cross-player motion received");
  const rod = await host.locator('[data-ocean="fish"]').boundingBox();
  // Throw, wait for the bite, hook it on the first frame the button shows the bite, then
  // play the tug of war with the bot. A line that snaps means throwing again.
  let landed = false;
  for (let attempt = 0; attempt < 6 && !landed; attempt++) {
    await host.mouse.move(rod.x + rod.width / 2, rod.y + rod.height / 2);
    await host.mouse.down();
    await host.waitForTimeout(800);
    await host.mouse.up();
    // The pull window is 1 s, shorter than a Playwright click can take on a software-rendered
    // scene, so press inside the page on the first frame the button is biting.
    await host.waitForFunction(
      () => {
        const button = document.querySelector('[data-ocean="fish"]');
        if (!button?.classList.contains("is-biting")) return false;
        const box = button.getBoundingClientRect();
        const init = {
          bubbles: true,
          pointerId: 7,
          isPrimary: true,
          button: 0,
          clientX: box.x + box.width / 2,
          clientY: box.y + box.height / 2,
        };
        // The controls are only drawn; the touch goes to the input layer.
        const layer = document.querySelector(".ocean-input");
        layer.dispatchEvent(new PointerEvent("pointerdown", init));
        layer.dispatchEvent(new PointerEvent("pointerup", init));
        return true;
      },
      undefined,
      { polling: "raf", timeout: 60000 },
    );
    await fightBot(host);
    landed = await host
      .getByText("Cá lên thuyền", { exact: false })
      .waitFor({ timeout: 10000 })
      .then(
        () => true,
        () => false,
      );
  }
  assert.ok(landed, "a fish was landed");
  await host.getByRole("button", { name: "Cất vào kho", exact: true }).click();
  await tap(host, host.getByRole("button", { name: "Kho cá 1" }));
  await host
    .getByRole("dialog")
    .getByText("Trong kho: 1 con", { exact: false })
    .waitFor();
  await host.getByRole("button", { name: "Đóng", exact: true }).click();
  for (const [width, height] of [
    [844, 390],
    [932, 430],
    [667, 375],
    [390, 844],
    [1440, 900],
  ]) {
    await host.setViewportSize({ width, height });
    await host.waitForTimeout(150);
    assert.equal(
      await host.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    for (const selector of [
      '[data-ocean="back"]',
      '[data-ocean="fish"]',
      ".ocean-stick",
    ]) {
      const box = await host.locator(selector).boundingBox();
      assert.ok(
        box.width >= 44 &&
          box.height >= 44 &&
          box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= width &&
          box.y + box.height <= height,
      );
    }
    await host.screenshot({
      path: `test-results/ocean-${width}x${height}.png`,
    });
  }
  await host.setViewportSize({ width: 844, height: 390 });
  // Reload keeps the account and enters the shared map directly, with one boat per UID.
  await host.reload();
  await host.getByText("Đã vào biển chung.", { exact: false }).waitFor();
  await guest.getByText("2 thuyền", { exact: true }).waitFor();
  // A second window for the same account replaces its lease; the first must stop.
  const duplicate = await host.context().newPage();
  await duplicate.goto(`${base}/?view=ocean`);
  await duplicate.getByText("Đã vào biển chung.", { exact: false }).waitFor();
  await host
    .locator("[data-loading-note]")
    .getByText("Tài khoản đã mở thuyền ở cửa sổ khác.", { exact: false })
    .waitFor();
  assert.equal(await host.locator('[data-ocean="fish"]').isDisabled(), true);
  await tap(host, host.getByRole("button", { name: "Về hub" }));
  await host.locator('[data-harbor="play"]').waitFor();
  await tap(duplicate, duplicate.getByRole("button", { name: "Về hub" }));
  await guest.getByText("1 thuyền", { exact: true }).waitFor();
  await guest.context().setOffline(true);
  await guest
    .locator("[data-loading-note]")
    .getByText("Đã mất mạng.", { exact: false })
    .waitFor();
  await tap(guest, guest.getByRole("button", { name: "Về hub" }));
  await guest.locator('[data-harbor="play"]').waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Shared ocean: two authenticated players, synced movement, fishing, mobile layouts, reload, duplicate lease, leave and offline passed",
  );
} catch (error) {
  console.error("Ocean browser failure:", error);
  for (const context of contexts)
    for (const page of context.pages()) {
      console.error(
        await page
          .locator("body")
          .innerText()
          .catch(() => "page unavailable"),
      );
    }
  throw error;
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
