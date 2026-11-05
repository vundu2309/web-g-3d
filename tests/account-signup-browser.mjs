import assert from "node:assert/strict";
import { launchBrowser } from "./browser.mjs";
import { FAKE_SUPABASE, startSupabaseDev } from "./support/supabase-dev.mjs";

// The sign-up dialog against a faked Supabase Auth. Covers both project settings:
// email confirmation ON (a clear "check your email" step, never a silently cleared
// form) and OFF (sign-up signs the player straight in).
const { vite, origin } = await startSupabaseDev();
const browser = await launchBrowser();
const session = (email) => {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: "tok-new",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: "r-new",
    user: {
      id: "user-new",
      aud: "authenticated",
      role: "authenticated",
      email,
      app_metadata: {},
      user_metadata: { display_name: "Lan" },
      created_at: new Date().toISOString(),
    },
  };
};
async function open(setting) {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
  });
  const calls = { signup: 0, login: 0, resend: 0 };
  await context.route(`${FAKE_SUPABASE}/**`, async (route) => {
    const request = route.request();
    const cors = {
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
      "content-type": "application/json",
    };
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: cors });
    const url = new URL(request.url());
    if (url.pathname.endsWith("/signup")) {
      calls.signup++;
      const email = JSON.parse(request.postData() || "{}").email;
      if (setting === "confirmation-off")
        return route.fulfill({
          status: 200,
          headers: cors,
          body: JSON.stringify(session(email)),
        });
      return route.fulfill({
        status: 200,
        headers: cors,
        body: JSON.stringify({
          id: "user-new",
          aud: "authenticated",
          role: "authenticated",
          email,
          confirmation_sent_at: new Date().toISOString(),
          app_metadata: {},
          user_metadata: { display_name: "Lan" },
          identities: [{}],
          created_at: new Date().toISOString(),
        }),
      });
    }
    if (url.pathname.endsWith("/token")) {
      calls.login++;
      // The first sign-in happens before the link was clicked; later ones after.
      if (calls.login === 1)
        return route.fulfill({
          status: 400,
          headers: cors,
          body: JSON.stringify({
            code: 400,
            error_code: "email_not_confirmed",
            msg: "Email not confirmed",
          }),
        });
      return route.fulfill({
        status: 200,
        headers: cors,
        body: JSON.stringify(session("lan@test.dev")),
      });
    }
    if (url.pathname.endsWith("/resend")) {
      calls.resend++;
      return route.fulfill({
        status: 200,
        headers: cors,
        body: JSON.stringify({ message_id: "m1" }),
      });
    }
    return route.fulfill({ status: 404, headers: cors, body: "{}" });
  });
  const page = await context.newPage();
  await page.goto(origin);
  await page.getByRole("button", { name: "Vào game" }).click();
  await page
    .getByRole("button", { name: "Chưa có tài khoản? Đăng ký" })
    .click();
  await page.getByLabel("Tên người chơi", { exact: true }).fill("Lan");
  await page.getByLabel("Email", { exact: true }).fill("lan@test.dev");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("matkhau-123");
  await page
    .getByRole("button", { name: "Tạo tài khoản", exact: true })
    .click();
  return { page, context, calls };
}
try {
  // Confirmation ON: a clear next step instead of a cleared form that goes nowhere.
  const on = await open("confirmation-on");
  await on.page
    .getByRole("heading", { name: "Kiểm tra email của bạn" })
    .waitFor();
  const dialog = on.page.locator("dialog.account-dialog");
  assert.match(
    await dialog.locator("[data-confirm-text]").innerText(),
    /lan@test\.dev/,
    "names the address it wrote to",
  );
  assert.equal(
    await dialog.locator("input").count(),
    0,
    "no empty form is left behind",
  );
  assert.deepEqual(await dialog.locator(".confirm-steps li").allInnerTexts(), [
    "Mở email vừa gửi (xem cả mục Spam).",
    "Bấm liên kết xác nhận trong email.",
    "Quay lại đây và bấm nút bên dưới.",
  ]);
  // Before the link is used, signing in says so (not a generic failure).
  await on.page
    .getByRole("button", { name: "Tôi đã xác nhận, đăng nhập" })
    .click();
  await on.page
    .getByText("Hãy xác nhận email trước khi đăng nhập.", { exact: true })
    .waitFor();
  assert.equal(await dialog.count(), 1, "the dialog stays open");
  // Resend works and says so.
  await on.page.getByRole("button", { name: "Gửi lại email" }).click();
  await on.page.getByText("Đã gửi lại email", { exact: false }).waitFor();
  assert.equal(on.calls.resend, 1);
  // After confirming, the same button signs the player in and closes the dialog.
  await on.page
    .getByRole("button", { name: "Tôi đã xác nhận, đăng nhập" })
    .click();
  await on.page.waitForFunction(
    () => !document.querySelector("dialog.account-dialog"),
    null,
    { timeout: 30000 },
  );
  assert.equal(on.calls.signup, 1);
  await on.context.close();

  // The email address is text, never markup.
  const hostile = await browser.newContext({
    viewport: { width: 844, height: 390 },
  });
  await hostile.route(`${FAKE_SUPABASE}/**`, (route) => {
    const cors = {
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "content-type": "application/json",
    };
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: cors });
    return route.fulfill({
      status: 200,
      headers: cors,
      body: JSON.stringify({
        id: "u",
        aud: "authenticated",
        email: "x",
        app_metadata: {},
        user_metadata: {},
        identities: [{}],
        created_at: new Date().toISOString(),
      }),
    });
  });
  const probe = await hostile.newPage();
  await probe.goto(origin);
  await probe.getByRole("button", { name: "Vào game" }).click();
  await probe
    .getByRole("button", { name: "Chưa có tài khoản? Đăng ký" })
    .click();
  await probe.getByLabel("Tên người chơi", { exact: true }).fill("Lan");
  await probe
    .getByLabel("Email", { exact: true })
    .evaluate((el) => el.removeAttribute("type"));
  await probe
    .getByLabel("Email", { exact: true })
    .fill('<img src=x onerror="window.pwned=1">@a.b');
  await probe.getByLabel("Mật khẩu", { exact: true }).fill("matkhau-123");
  await probe
    .getByRole("button", { name: "Tạo tài khoản", exact: true })
    .click();
  await probe
    .getByRole("heading", { name: "Kiểm tra email của bạn" })
    .waitFor();
  assert.equal(
    await probe.locator("dialog img").count(),
    0,
    "no injected element",
  );
  assert.equal(
    await probe.evaluate(() => window.pwned),
    undefined,
    "no injected script ran",
  );
  await hostile.close();

  // Confirmation OFF: sign-up signs in directly, with no confirmation step at all.
  const off = await open("confirmation-off");
  await off.page.waitForFunction(
    () => !document.querySelector("dialog.account-dialog"),
    null,
    { timeout: 30000 },
  );
  assert.equal(off.calls.login, 0, "no extra sign-in was needed");
  assert.equal(off.calls.resend, 0);
  assert.equal(
    await off.page
      .getByRole("heading", { name: "Kiểm tra email của bạn" })
      .count(),
    0,
    "no confirmation step",
  );
  await off.context.close();
  console.log(
    "Account sign-up: confirmation ON shows a clear step with resend and sign-in; OFF signs in straight away; the address is never markup.",
  );
} finally {
  await browser.close();
  await vite.close();
}
