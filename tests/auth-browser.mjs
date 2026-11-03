import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { launchBrowser } from "./browser.mjs";
const browser = await launchBrowser();
const contexts = [];
const errors = [];
async function player() {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
  });
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  // Fail closed if a dev emulator flag ever sends this test to production.
  await context.route(
    /https:\/\/(identitytoolkit|securetoken)\.googleapis\.com|https:\/\/.*\.firebaseio\.com|https:\/\/firestore\.googleapis\.com/,
    (route) => {
      errors.push("Unexpected production Firebase request");
      return route.abort();
    },
  );
  await page.goto(process.env.TEST_BASE_URL);
  return page;
}
async function register(page, name, email) {
  await page
    .getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Chưa có tài khoản? Đăng ký" })
    .click();
  assert.equal(
    await page
      .getByRole("dialog")
      .locator('button[type="submit"]')
      .evaluate(
        (button) =>
          button.getBoundingClientRect().bottom <=
          button.closest("dialog").getBoundingClientRect().bottom - 4,
      ),
    true,
    "registration action fits landscape phone without scrolling",
  );
  await page.getByLabel("Tên người chơi", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("GameTest-123!");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Tạo tài khoản", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.getByText(`Player: ${name}`, { exact: true }).waitFor();
}
try {
  await mkdir("test-results", { recursive: true });
  const host = await player();
  await register(host, "Minh", "minh@example.test");
  const roomCommits = [];
  await host.context().route("**/documents:commit**", (route) => {
    roomCommits.push(route.request().postDataJSON());
    return route.continue();
  });

  await host.getByRole("button", { name: "Tạo phòng", exact: true }).click();
  assert.equal(await host.getByLabel("Tên của bạn").inputValue(), "Minh");
  assert.equal(
    await host.getByLabel("Tên của bạn").getAttribute("readonly"),
    "",
  );
  await host.getByLabel("Tên phòng", { exact: true }).fill("Hội bạn cuối tuần");
  await host
    .locator("#room-form")
    .getByRole("button", { name: "Tạo phòng", exact: true })
    .click();
  await host.getByRole("heading", { name: "Phòng chờ", exact: true }).waitFor();
  assert.equal(
    roomCommits.length,
    1,
    "first room creation uses one commit, not a separate profile commit",
  );
  const writes = roomCommits[0].writes
    .filter((write) => write.update)
    .map((write) => write.update.name);
  assert.equal(writes.length, 2);
  assert.ok(writes.some((path) => path.includes("/profiles/")));
  assert.ok(writes.some((path) => path.includes("/rooms/")));
  const guest = await player();
  await register(guest, "Lan", "lan@example.test");
  // Directory reads must not depend on an own-profile transaction. Deliberately
  // block document batch reads until the room list is visible.
  let blockedProfileReads = 0;
  let blockProfileReads = true;
  const blockProfile = (route) => {
    blockedProfileReads++;
    return blockProfileReads ? route.abort() : route.continue();
  };
  await guest.context().route("**/documents:batchGet**", blockProfile);

  await guest
    .getByRole("button", { name: "Tham gia phòng", exact: true })
    .click();
  await guest
    .getByRole("heading", { name: "Hội bạn cuối tuần", exact: true })
    .waitFor();
  await guest.getByText("Chủ phòng: Minh", { exact: true }).waitFor();
  assert.equal(
    blockedProfileReads,
    0,
    "room directory does not wait for profile document reads",
  );
  blockProfileReads = false;

  await guest.screenshot({ path: "test-results/rooms-online-emulator.png" });
  await guest
    .locator(".room-row")
    .getByRole("button", { name: "Vào phòng", exact: true })
    .click();
  await guest.getByRole("button", { name: "Sẵn sàng", exact: true }).waitFor();
  assert.ok(
    blockedProfileReads > 0,
    "profile/room transaction reads use the intercepted transport after selecting a room",
  );
  await guest.getByRole("button", { name: "Sẵn sàng", exact: true }).click();
  await host.waitForFunction(
    () => !document.querySelector('[data-action="start"]').disabled,
  );
  await guest.reload();
  await guest
    .getByRole("button", { name: "Hủy sẵn sàng", exact: true })
    .waitFor();
  await host.getByRole("button", { name: "Rời phòng", exact: true }).click();
  await host
    .getByRole("dialog")
    .getByRole("button", { name: "Rời phòng", exact: true })
    .click();
  await guest.getByRole("alert").filter({ hasText: "Phòng đã đóng" }).waitFor();
  await guest.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await guest
    .getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true })
    .click();
  await guest.getByLabel("Email", { exact: true }).fill("lan@example.test");
  await guest.getByLabel("Mật khẩu", { exact: true }).fill("wrong-pass");
  await guest
    .getByRole("dialog")
    .getByRole("button", { name: "Đăng nhập", exact: true })
    .click();
  await guest
    .getByRole("dialog")
    .getByRole("alert")
    .filter({ hasText: "Email hoặc mật khẩu" })
    .waitFor();
  await guest.getByLabel("Mật khẩu", { exact: true }).fill("GameTest-123!");
  await guest
    .getByRole("dialog")
    .getByRole("button", { name: "Đăng nhập", exact: true })
    .click();
  await guest.getByText("Player: Lan", { exact: true }).waitFor();
  await guest.reload();
  await guest.getByText("Player: Lan", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Auth + Firestore emulator: real SDK signup/login/logout/persistence, profile, named room listing, two accounts and ready/close passed.",
  );
} catch (error) {
  for (const [i, context] of contexts.entries())
    for (const page of context.pages()) {
      await page.screenshot({ path: `test-results/auth-failure-${i}.png` });
      console.error(await page.locator("#app").innerText());
    }
  throw error;
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
