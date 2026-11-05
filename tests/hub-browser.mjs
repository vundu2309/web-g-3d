import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { launchBrowser } from "./browser.mjs";

const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 844, height: 390 },
  reducedMotion: "reduce",
});
const errors = [];
context.on("page", (page) =>
  page.on("pageerror", (error) => errors.push(error.message)),
);
const base = process.env.TEST_BASE_URL + "/?view=monopoly-hub";
const output = process.env.TEST_ARTIFACT_DIR || "test-results";
await mkdir(output, { recursive: true });
async function noOverflow(page) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "no horizontal overflow",
  );
}
try {
  const host = await context.newPage();
  await host.goto(base);
  await host
    .getByRole("button", { name: "Thử trên thiết bị này", exact: true })
    .click();
  await host.screenshot({ path: `${output}/home-mobile.png` });
  await host.getByRole("button", { name: "Tạo phòng", exact: true }).click();
  await host
    .locator("#room-form")
    .getByRole("button", { name: "Tạo phòng", exact: true })
    .click();
  await host.getByRole("alert").filter({ hasText: "Tên cần có" }).waitFor();
  await host.getByLabel("Tên của bạn").fill("Minh");
  await host.screenshot({ path: `${output}/create-mobile.png` });
  await host
    .locator("#room-form")
    .getByRole("button", { name: "Tạo phòng", exact: true })
    .click();
  await host.getByRole("heading", { name: "Phòng chờ" }).waitFor();
  await host
    .getByRole("heading", { name: "Minh (Bạn)", exact: true })
    .waitFor();
  const code = await host.locator(".room-code").textContent();
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(
    await host
      .getByRole("button", { name: "Bắt đầu", exact: true })
      .isDisabled(),
    true,
  );
  const guest = await context.newPage();
  await guest.goto(base);
  await guest
    .getByRole("button", { name: "Thử trên thiết bị này", exact: true })
    .click();
  await guest
    .getByRole("button", { name: "Tham gia phòng", exact: true })
    .click();
  await guest
    .getByRole("heading", { name: "Chọn phòng", exact: true })
    .waitFor();
  await guest
    .getByRole("button", { name: "Nhập mã phòng", exact: true })
    .click();
  await guest.getByLabel("Tên của bạn").fill("Lan <b>");
  await guest.getByLabel("Mã phòng", { exact: true }).fill("BAD");
  await guest.getByRole("button", { name: "Vào phòng", exact: true }).click();
  await guest.getByRole("alert").filter({ hasText: "6 chữ hoặc số" }).waitFor();
  await guest.getByLabel("Mã phòng", { exact: true }).fill("ZZZZZZ");
  await guest.getByRole("button", { name: "Vào phòng", exact: true }).click();
  await guest
    .getByRole("alert")
    .filter({ hasText: "Không tìm thấy" })
    .waitFor();
  await guest.getByLabel("Mã phòng", { exact: true }).fill(code);
  await guest.screenshot({ path: `${output}/join-mobile.png` });
  await guest.getByRole("button", { name: "Vào phòng", exact: true }).click();
  await guest.getByRole("button", { name: "Sẵn sàng", exact: true }).waitFor();
  await host.getByRole("heading", { name: "Lan <b>", exact: true }).waitFor();
  assert.equal(
    await host.locator(".player-slot h2 b").count(),
    0,
    "player text is escaped",
  );
  await host.reload();
  await host.getByRole("heading", { name: "Lan <b>", exact: true }).waitFor();
  await guest.getByRole("button", { name: "Sẵn sàng", exact: true }).click();
  await guest
    .getByRole("button", { name: "Hủy sẵn sàng", exact: true })
    .waitFor();
  await host.waitForFunction(
    () => !document.querySelector('[data-action="start"]').disabled,
  );
  await guest
    .getByRole("button", { name: "Hủy sẵn sàng", exact: true })
    .click();
  await host.waitForFunction(
    () => document.querySelector('[data-action="start"]').disabled,
  );
  await guest.getByRole("button", { name: "Sẵn sàng", exact: true }).click();
  await host.waitForFunction(
    () => !document.querySelector('[data-action="start"]').disabled,
  );
  await host.screenshot({ path: `${output}/lobby-mobile.png` });
  for (const viewport of [
    { width: 667, height: 375 },
    { width: 844, height: 390 },
    { width: 932, height: 430 },
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await host.setViewportSize(viewport);
    await noOverflow(host);
    await host.screenshot({ path: `${output}/lobby-${viewport.width}.png` });
    if (viewport.width > viewport.height) {
      assert.equal(
        await host
          .getByRole("button", { name: "Bắt đầu", exact: true })
          .evaluate((el) => el.getBoundingClientRect().bottom < innerHeight),
        true,
        "landscape action visible",
      );
    }
  }
  await host.getByRole("button", { name: "Bắt đầu", exact: true }).click();
  await guest.getByRole("heading", { name: "Phòng đã sẵn sàng" }).waitFor();
  await host
    .getByRole("button", { name: "Rời phòng", exact: true })
    .first()
    .click();
  await host
    .getByRole("dialog")
    .getByRole("button", { name: "Ở lại" })
    .waitFor();
  await host.keyboard.press("Escape");
  assert.equal(await host.getByRole("dialog").count(), 0);
  await host
    .getByRole("button", { name: "Rời phòng", exact: true })
    .first()
    .click();
  await host
    .getByRole("dialog")
    .getByRole("button", { name: "Rời phòng", exact: true })
    .click();
  await guest.getByRole("alert").filter({ hasText: "Phòng đã đóng" }).waitFor();
  await host.getByRole("button", { name: "Tạo phòng", exact: true }).waitFor();
  await host.setViewportSize({ width: 844, height: 390 });
  await host.screenshot({ path: `${output}/home-landscape.png` });
  await noOverflow(host);
  await host.getByRole("link", { name: "Cách chơi", exact: true }).click();
  await host.getByRole("heading", { name: "Cách chơi" }).waitFor();
  await host.getByRole("button", { name: "Về trang chính" }).click();
  // Exercise genuine online error UI using a controlled failing Auth endpoint, never a live write.
  await host.getByRole("button", { name: "Chuyển sang chơi online" }).click();
  await context.route("https://identitytoolkit.googleapis.com/**", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: 400, message: "OPERATION_NOT_ALLOWED" },
      }),
    }),
  );
  await host.getByRole("button", { name: "Tạo phòng", exact: true }).click();
  await host
    .getByRole("dialog")
    .getByLabel("Email", { exact: true })
    .fill("test@example.com");
  await host
    .getByRole("dialog")
    .getByLabel("Mật khẩu", { exact: true })
    .fill("test-password");
  await host
    .getByRole("button", { name: "Hiện mật khẩu", exact: true })
    .click();
  assert.equal(
    await host.locator("#account-password").getAttribute("type"),
    "text",
  );
  await host
    .getByRole("dialog")
    .getByRole("button", { name: "Đăng nhập", exact: true })
    .click();
  await host
    .getByRole("dialog")
    .getByRole("alert")
    .filter({ hasText: "Email/Password" })
    .waitFor();
  await host
    .getByRole("button", { name: "Chưa có tài khoản? Đăng ký" })
    .click();
  await host.getByLabel("Tên người chơi", { exact: true }).fill("Minh");
  await host
    .getByRole("dialog")
    .getByLabel("Email", { exact: true })
    .fill("test@example.com");
  await host
    .getByRole("dialog")
    .getByLabel("Mật khẩu", { exact: true })
    .fill("test-password");
  await host.getByRole("dialog").evaluate((dialog) => {
    dialog.scrollTop = 0;
  });
  await host
    .getByRole("dialog")
    .screenshot({ path: `${output}/register-mobile.png` });
  await host
    .getByRole("dialog")
    .getByRole("button", { name: "Tạo tài khoản", exact: true })
    .click();
  await host
    .getByRole("dialog")
    .getByRole("alert")
    .filter({ hasText: "Email/Password" })
    .waitFor();
  await host
    .getByRole("dialog")
    .screenshot({ path: `${output}/account-mobile.png` });
  await host
    .getByRole("button", { name: "Đã có tài khoản? Đăng nhập" })
    .click();
  await host
    .getByRole("button", { name: "Quên mật khẩu?", exact: true })
    .click();
  await host
    .getByRole("heading", { name: "Quên mật khẩu", exact: true })
    .waitFor();
  await host
    .getByRole("dialog")
    .getByLabel("Email", { exact: true })
    .fill("test@example.com");
  await host
    .getByRole("button", { name: "Gửi hướng dẫn", exact: true })
    .click();
  await host
    .getByRole("dialog")
    .getByRole("alert")
    .filter({ hasText: "Email/Password" })
    .waitFor();
  await host.getByRole("button", { name: "Đóng", exact: true }).click();
  assert.deepEqual(errors, []);
  console.log(
    "Hub browser passed: create/join, validation, two clients, readiness, reload, start, close, responsive, online error.",
  );
} catch (error) {
  for (const [i, page] of context.pages().entries()) {
    await page.screenshot({ path: `${output}/failure-${i}.png` });
    console.error(
      "Browser failure state",
      i,
      await page.locator("#app").innerText(),
    );
  }
  throw error;
} finally {
  await context.close();
  await browser.close();
}
