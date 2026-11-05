import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { launchBrowser } from "./browser.mjs";
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
  await page.getByRole("button", { name: "Vào game", exact: true }).click();
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
  await host.getByRole("button", { name: "Thuyền trong kênh" }).click();
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
  await host.getByRole("button", { name: "Thả câu", exact: true }).click();
  await host.getByRole("button", { name: "Kéo cá!", exact: true }).waitFor();
  await host.getByRole("button", { name: "Kéo cá!", exact: true }).click();
  await host.getByText("Đã kéo được cá!", { exact: false }).waitFor();
  await host.getByRole("button", { name: "Kho cá 1" }).click();
  await host
    .getByRole("dialog")
    .getByText("Bạn đã bắt 1 con cá", { exact: false })
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
    .getByText("Tài khoản đã mở thuyền ở cửa sổ khác.", { exact: false })
    .waitFor();
  assert.equal(
    await host
      .getByRole("button", { name: "Thả câu", exact: true })
      .isDisabled(),
    true,
  );
  await host.getByRole("button", { name: "Về hub" }).click();
  await host.getByRole("button", { name: "Vào game", exact: true }).waitFor();
  await duplicate.getByRole("button", { name: "Về hub" }).click();
  await guest.getByText("1 thuyền", { exact: true }).waitFor();
  await guest.context().setOffline(true);
  await guest.getByText("Đã mất mạng.", { exact: false }).waitFor();
  await guest.getByRole("button", { name: "Về hub" }).click();
  await guest.getByRole("button", { name: "Vào game", exact: true }).waitFor();
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
