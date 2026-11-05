import { createServer } from "node:http";
import { createServer as createSmtp } from "node:net";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { createServer as createViteServer } from "vite";
import pg from "pg";
import assert from "node:assert/strict";
import { createApi } from "../server/app.mjs";
import { listenForChanges } from "../server/notifications.mjs";
import { launchBrowser } from "../tests/browser.mjs";

// Entire stack is disposable, private/local. No external Auth/DB writes or emails.
const prefix = `hub-e2e-${process.pid}`;
const env = { ...process.env };
for (const key of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete env[key];
const containers = [];
const mail = [];
const contexts = [];
const errors = [];
let api, gateway, smtp, vite, browser, listener, authPort, restPort;
function docker(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      ["--host=unix:///var/run/docker.sock", ...args],
      { env, stdio: ["pipe", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.on("data", (data) => {
      output += data;
    });
    child.stderr.on("data", (data) => {
      output += data;
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, output }));
    child.stdin.end(input);
  });
}
async function run(name, args) {
  const result = await docker([
    "run",
    "--rm",
    "-d",
    "--name",
    name,
    "--network",
    prefix,
    ...args,
  ]);
  assert.equal(result.code, 0, result.output);
  containers.push(name);
  return name;
}
async function port(name, internal) {
  const result = await docker(["port", name, String(internal)]);
  assert.equal(result.code, 0, result.output);
  return Number(result.output.trim().split(":").at(-1));
}
async function sql(input) {
  const result = await docker(
    [
      "exec",
      "-i",
      `${prefix}-db`,
      "psql",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    input,
  );
  assert.equal(result.code, 0, result.output);
  return result.output;
}
const listen = (server) =>
  new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
async function waitFor(check, label) {
  for (let i = 0; i < 120; i++) {
    try {
      if (await check()) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Not ready: ${label}`);
}
async function incomingLink(email, type) {
  let message;
  await waitFor(() => {
    message = mail.findLast(
      (value) =>
        value.includes(email) &&
        value
          .replace(/=\r?\n/g, "")
          .replaceAll("=3D", "=")
          .includes(`type=${type}`),
    );
    return !!message;
  }, "local confirmation/recovery mail");
  const decoded = message
    .replace(/=\r?\n/g, "")
    .replace(/=([A-F0-9]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replaceAll("&amp;", "&");
  const links = [...decoded.matchAll(/href="([^"]+)"/g)].map(
    (match) => match[1],
  );
  return links.find((link) => link.includes("/verify?")) || links[0];
}
async function player() {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
  });
  contexts.push(context);
  await context.route(/https:\/\//, (route) => {
    errors.push("Unexpected external request");
    return route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + "/?view=monopoly-hub");
  return page;
}
let base;
async function register(page, name, email) {
  await page
    .getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Chưa có tài khoản? Đăng ký" })
    .click();
  await page.getByLabel("Tên người chơi", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("LocalGame-Test123!");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Tạo tài khoản", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Hãy kiểm tra email" })
    .waitFor();
  await page.goto(await incomingLink(email, "signup"));
  await page.getByText(`Player: ${name}`, { exact: true }).waitFor();
  await page.goto(base + "/?view=monopoly-hub");
  await page.getByText(`Player: ${name}`, { exact: true }).waitFor();
}
try {
  const network = await docker(["network", "create", prefix]);
  assert.equal(network.code, 0, network.output);
  await run(`${prefix}-db`, [
    "--network-alias",
    "db",
    "-p",
    "127.0.0.1::5432",
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "postgres:17-alpine@sha256:266d3c257594e195b309ae9d1805e54c788f1d7b375f56bf6c367aac6c917e7b",
  ]);
  // The image bootstrap server accepts Unix sockets before its final restart.
  // Wait for TCP to avoid seeding schema into that temporary server.
  await waitFor(
    async () =>
      (
        await docker([
          "exec",
          `${prefix}-db`,
          "pg_isready",
          "-h",
          "127.0.0.1",
          "-U",
          "postgres",
        ])
      ).code === 0,
    "PostgreSQL",
  );
  await sql(
    `create role anon;create role authenticated;create role authenticator login noinherit;grant anon,authenticated to authenticator;create role supabase_auth_admin login superuser;create schema auth authorization supabase_auth_admin;alter role supabase_auth_admin set search_path=auth;create extension if not exists pgcrypto;`,
  );
  smtp = createSmtp((socket) => {
    socket.write("220 local-test\r\n");
    let buffer = "",
      dataMode = false,
      message = "";
    socket.on("data", (data) => {
      buffer += data;
      while (buffer.includes("\r\n")) {
        const at = buffer.indexOf("\r\n");
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        if (dataMode) {
          if (line === ".") {
            mail.push(message);
            message = "";
            dataMode = false;
            socket.write("250 accepted\r\n");
          } else message += line + "\r\n";
        } else if (line.startsWith("EHLO"))
          socket.write("250-local-test\r\n250 OK\r\n");
        else if (line.startsWith("DATA")) {
          dataMode = true;
          socket.write("354 continue\r\n");
        } else if (line.startsWith("QUIT")) socket.end("221 bye\r\n");
        else socket.write("250 OK\r\n");
      }
    });
  });
  await listen(smtp);
  gateway = createServer(async (req, res) => {
    try {
      const auth = req.url.startsWith("/auth/v1/");
      const prefix = auth ? "/auth/v1" : "/rest/v1";
      const target = auth ? authPort : restPort;
      if (!target) {
        res.writeHead(503);
        res.end();
        return;
      }
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const headers = { ...req.headers };
      delete headers.host;
      delete headers["content-length"];
      const response = await fetch(
        `http://127.0.0.1:${target}${req.url.slice(prefix.length)}`,
        {
          method: req.method,
          headers,
          body: ["GET", "HEAD"].includes(req.method)
            ? undefined
            : Buffer.concat(chunks),
          redirect: "manual",
        },
      );
      res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "authorization,apikey,content-type,x-client-info,x-supabase-api-version",
      );
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,DELETE,OPTIONS",
      );
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      for (const [key, value] of response.headers)
        if (
          ![
            "content-length",
            "content-encoding",
            "connection",
            "access-control-allow-origin",
            "access-control-allow-headers",
            "access-control-allow-methods",
          ].includes(key)
        )
          res.setHeader(key, value);
      res.writeHead(response.status);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(502);
      res.end();
    }
  });
  await listen(gateway);
  const gatewayUrl = `http://127.0.0.1:${gateway.address().port}`;
  api = createApi({
    url: gatewayUrl,
    key: "local-test-key",
    origins: ["http://127.0.0.1"],
    request: fetch,
  });
  await listen(api);
  const apiUrl = `http://127.0.0.1:${api.address().port}`;
  vite = await createViteServer({
    server: { host: "127.0.0.1", port: 0 },
    logLevel: "warn",
    define: {
      "import.meta.env.VITE_ONLINE_BACKEND": JSON.stringify("supabase"),
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(gatewayUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY":
        JSON.stringify("local-test-key"),
      "import.meta.env.VITE_API_URL": JSON.stringify(apiUrl),
    },
  });
  await vite.listen();
  base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  // Actual API origin is the Vite port. Recreate API with the exact allowlist.
  await new Promise((resolve) => api.io.close(resolve));
  await new Promise((resolve) => api.close(resolve));
  api = createApi({ url: gatewayUrl, key: "local-test-key", origins: [base] });
  await new Promise((resolve) =>
    api.listen(Number(apiUrl.split(":").at(-1)), "0.0.0.0", resolve),
  );
  const jwt = randomBytes(48).toString("hex");
  const authEnv = {
    GOTRUE_API_HOST: "0.0.0.0",
    GOTRUE_API_PORT: "9999",
    API_EXTERNAL_URL: gatewayUrl,
    GOTRUE_DB_DRIVER: "postgres",
    GOTRUE_DB_DATABASE_URL: "postgres://supabase_auth_admin@db:5432/postgres",
    GOTRUE_SITE_URL: base,
    GOTRUE_URI_ALLOW_LIST: base + "/**",
    GOTRUE_JWT_SECRET: jwt,
    GOTRUE_JWT_AUD: "authenticated",
    GOTRUE_JWT_DEFAULT_GROUP_NAME: "authenticated",
    GOTRUE_JWT_ADMIN_ROLES: "service_role",
    GOTRUE_EXTERNAL_EMAIL_ENABLED: "true",
    GOTRUE_MAILER_AUTOCONFIRM: "false",
    GOTRUE_SMTP_HOST: "host.docker.internal",
    GOTRUE_SMTP_PORT: String(smtp.address().port),
    GOTRUE_SMTP_ADMIN_EMAIL: "noreply@example.test",
    GOTRUE_SMTP_SENDER_NAME: "Local test",
    GOTRUE_SMTP_MAX_FREQUENCY: "1s",
    GOTRUE_MAILER_URLPATHS_CONFIRMATION: "/auth/v1/verify",
    GOTRUE_MAILER_URLPATHS_RECOVERY: "/auth/v1/verify",
    GOTRUE_RATE_LIMIT_EMAIL_SENT: "100",
  };
  await run(`${prefix}-auth`, [
    "--add-host",
    "host.docker.internal:host-gateway",
    "-p",
    "127.0.0.1::9999",
    ...Object.entries(authEnv).flatMap(([key, value]) => [
      "-e",
      `${key}=${value}`,
    ]),
    "supabase/gotrue:v2.197.0",
  ]);
  authPort = await port(`${prefix}-auth`, 9999);
  await waitFor(
    async () => (await fetch(`http://127.0.0.1:${authPort}/health`)).ok,
    "Supabase Auth",
  );
  await sql(
    `create or replace function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;create or replace function auth.jwt() returns jsonb language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;grant usage on schema auth to authenticated;grant execute on function auth.uid(),auth.jwt() to authenticated;` +
      (await readFile(
        "supabase/migrations/20261104084408_hub_infrastructure.sql",
        "utf8",
      )),
  );
  await run(`${prefix}-rest`, [
    "-p",
    "127.0.0.1::3000",
    "-e",
    "PGRST_DB_URI=postgres://authenticator@db:5432/postgres",
    "-e",
    "PGRST_DB_SCHEMAS=public",
    "-e",
    "PGRST_DB_ANON_ROLE=anon",
    "-e",
    `PGRST_JWT_SECRET=${jwt}`,
    "postgrest/postgrest:v14.18",
  ]);
  restPort = await port(`${prefix}-rest`, 3000);
  await waitFor(
    async () => (await fetch(`http://127.0.0.1:${restPort}/`)).ok,
    "PostgREST",
  );
  class LocalClient extends pg.Client {
    constructor(config) {
      super({ ...config, ssl: false });
    }
  } // Private disposable DB only; production verified TLS is unchanged.
  listener = listenForChanges({
    connectionString: `postgres://postgres@127.0.0.1:${await port(`${prefix}-db`, 5432)}/postgres`,
    Client: LocalClient,
    ready: () => {},
    changed: () => api.io.emit("hub:changed"),
    log: () => {},
  });
  await waitFor(() => listener.isReady(), "LISTEN");
  console.log("Local Auth, mail sink, PostgREST, API and PostgreSQL ready");
  browser = await launchBrowser();
  await mkdir("test-results", { recursive: true });
  const host = await player();
  await register(host, "Minh", "minh@example.test");
  console.log("Supabase Auth signup + real email confirmation passed");
  await host.getByRole("button", { name: "Tạo phòng", exact: true }).click();
  await host.getByLabel("Tên phòng", { exact: true }).fill("Socket test");
  await host
    .locator("#room-form")
    .getByRole("button", { name: "Tạo phòng", exact: true })
    .click();
  await host.getByRole("heading", { name: "Phòng chờ", exact: true }).waitFor();
  const code = (await host.locator(".room-code").innerText()).replace(
    /\s/g,
    "",
  );
  const guest = await player();
  await register(guest, "Lan", "lan@example.test");
  await guest
    .getByRole("button", { name: "Tham gia phòng", exact: true })
    .click();
  await guest
    .locator(".room-row")
    .filter({ hasText: "Socket test" })
    .getByRole("button", { name: "Vào phòng", exact: true })
    .click();
  await guest
    .getByRole("heading", { name: "Phòng chờ", exact: true })
    .waitFor();
  await host.getByText("Lan", { exact: true }).waitFor();
  await guest.getByRole("button", { name: "Sẵn sàng", exact: true }).click();
  await host
    .getByRole("button", { name: "Bắt đầu", exact: true })
    .waitFor({ state: "visible" });
  await host.locator('[data-action="start"]:not([disabled])').waitFor();
  assert.equal(
    await host
      .getByRole("button", { name: "Bắt đầu", exact: true })
      .isEnabled(),
    true,
  );
  await guest.context().setOffline(true);
  await guest.context().setOffline(false);
  await guest.reload();
  await guest
    .getByRole("heading", { name: "Phòng chờ", exact: true })
    .waitFor();
  await host.screenshot({ path: "test-results/supabase-lobby.png" });
  await host.getByRole("button", { name: "Bắt đầu", exact: true }).click();
  await guest
    .getByRole("heading", { name: "Phòng đã sẵn sàng", exact: true })
    .waitFor();
  console.log(
    "Real PostgreSQL + Socket.IO two-browser create/join/ready/reconnect/start passed",
    code.length === 6 ? "(valid room code)" : "",
  );
  await host.locator("[data-action=leave]").first().click();
  await host.locator('[data-action="confirm-leave"]').click();
  await guest.getByRole("button", { name: "Tạo phòng", exact: true }).waitFor();
  await host.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await host
    .getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true })
    .click();
  await host
    .getByRole("button", { name: "Quên mật khẩu?", exact: true })
    .click();
  await host.getByLabel("Email", { exact: true }).fill("minh@example.test");
  await host
    .getByRole("button", { name: "Gửi hướng dẫn", exact: true })
    .click();
  await host
    .getByRole("status")
    .filter({ hasText: "Nếu email có tài khoản" })
    .waitFor();
  await host.goto(await incomingLink("minh@example.test", "recovery"));
  await host.getByRole("dialog", { name: "Đặt mật khẩu mới" }).waitFor();
  await host
    .getByLabel("Mật khẩu mới", { exact: true })
    .fill("ChangedLocal-Test123!");
  await host
    .getByLabel("Nhập lại mật khẩu mới", { exact: true })
    .fill("mismatch");
  await host.getByRole("button", { name: "Lưu mật khẩu" }).click();
  await host.getByRole("alert").filter({ hasText: "Hai mật khẩu" }).waitFor();
  await host
    .getByLabel("Nhập lại mật khẩu mới", { exact: true })
    .fill("ChangedLocal-Test123!");
  assert.equal(
    await host.locator("#recovery-form").evaluate((form) => {
      const labels = [...form.querySelectorAll("label")];
      return labels.every((label) => {
        const input = form.querySelector(`#${label.htmlFor}`);
        return (
          label.getBoundingClientRect().right + 4 <=
          input.getBoundingClientRect().left
        );
      });
    }),
    true,
    "Recovery labels remain clear of inputs on landscape phones",
  );
  await host.screenshot({ path: "test-results/supabase-recovery.png" });
  await host.getByRole("button", { name: "Lưu mật khẩu" }).click();
  await host
    .getByRole("status")
    .filter({ hasText: "Đã đổi mật khẩu" })
    .waitFor();
  console.log("Real Supabase password recovery email/callback/update passed");
  await host
    .getByRole("dialog")
    .getByRole("button", { name: "Đóng", exact: true })
    .click();
  await host.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await host
    .getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true })
    .click();
  await host.getByLabel("Email", { exact: true }).fill("minh@example.test");
  await host.getByLabel("Mật khẩu", { exact: true }).fill("LocalGame-Test123!");
  await host
    .getByRole("dialog")
    .getByRole("button", { name: "Đăng nhập", exact: true })
    .click();
  await host
    .getByRole("alert")
    .filter({ hasText: "Email hoặc mật khẩu không đúng" })
    .waitFor();
  await host
    .getByLabel("Mật khẩu", { exact: true })
    .fill("ChangedLocal-Test123!");
  await host
    .getByRole("dialog")
    .getByRole("button", { name: "Đăng nhập", exact: true })
    .click();
  await host.getByText("Player: Minh", { exact: true }).waitFor();
  await host.reload();
  await host.getByText("Player: Minh", { exact: true }).waitFor();
  await host.screenshot({ path: "test-results/supabase-home.png" });
  console.log(
    "New password login, old password rejection and session persistence passed",
  );
  await host.goto(base);
  await guest.goto(base);
  await host.getByRole("button", { name: "Vào game", exact: true }).click();
  await guest.getByRole("button", { name: "Vào game", exact: true }).click();
  await host.getByText("2 thuyền", { exact: true }).waitFor();
  await guest.getByText("2 thuyền", { exact: true }).waitFor();
  const hostBoat = host.locator(".ocean-boat-label.is-self");
  await hostBoat.waitFor();
  const uid = await hostBoat.getAttribute("data-uid");
  const before = await hostBoat.evaluate((label) => ({
    x: Number(label.dataset.x),
    z: Number(label.dataset.z),
  }));
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
  await guest.bringToFront();
  await guest.waitForFunction(
    ({ uid, x, z }) => {
      const label = document.querySelector(`[data-uid="${uid}"]`);
      return (
        label &&
        Math.hypot(Number(label.dataset.x) - x, Number(label.dataset.z) - z) > 3
      );
    },
    { uid, ...before },
  );
  await host.screenshot({ path: "test-results/supabase-ocean.png" });
  await guest.getByRole("button", { name: "Về hub" }).click();
  await host.getByText("1 thuyền", { exact: true }).waitFor();
  console.log(
    "Supabase Auth + Socket.IO: direct common-map entry, two boats, push movement and leave passed",
  );
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await vite?.close();
  await listener?.close();
  if (api) {
    await new Promise((resolve) => api.io.close(resolve));
    await new Promise((resolve) => api.close(resolve));
  }
  if (gateway) await new Promise((resolve) => gateway.close(resolve));
  if (smtp) await new Promise((resolve) => smtp.close(resolve));
  for (const name of containers.reverse()) await docker(["rm", "-f", name]);
  await docker(["network", "rm", prefix]);
}
