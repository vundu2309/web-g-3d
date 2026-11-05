import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const name = `web-g-3d-test-${process.pid}`;
const env = { ...process.env };
for (const key of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete env[key];
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
const sql = (input) =>
  docker(
    [
      "exec",
      "-i",
      name,
      "psql",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    input,
  );
const actor = (id) =>
  `set role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-${String(id).padStart(12, "0")}',false);`;
try {
  const start = await docker([
    "run",
    "--rm",
    "-d",
    "--name",
    name,
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "postgres:17-alpine@sha256:266d3c257594e195b309ae9d1805e54c788f1d7b375f56bf6c367aac6c917e7b",
  ]);
  assert.equal(start.code, 0, start.output);
  for (let i = 0; i < 50; i++) {
    const ready = await docker([
      "exec",
      name,
      "pg_isready",
      "-h",
      "127.0.0.1",
      "-U",
      "postgres",
    ]);
    if (ready.code === 0) break;
    if (i === 49) throw new Error("Postgres not ready");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const files = [
    "tests/postgres-bootstrap.sql",
    "supabase/migrations/20261104084408_hub_infrastructure.sql",
    "tests/hub-postgres.sql",
  ];
  const setup = await sql(
    (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n"),
  );
  assert.equal(setup.code, 0, setup.output);
  const seed = await sql(
    `insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');${actor(1)}select public.hub_command('create','ABCDEF','Host','Race',2);`,
  );
  assert.equal(seed.code, 0, seed.output);
  const joins = await Promise.all(
    [2, 3].map((id) =>
      sql(`${actor(id)}select public.hub_command('join','ABCDEF','Guest');`),
    ),
  );
  assert.equal(
    joins.filter((result) => result.code === 0).length,
    1,
    "Concurrent joins must admit exactly one guest",
  );
  assert.ok(
    joins.find((result) => result.code !== 0).output.includes("Phòng đã đủ"),
  );
  const count = await sql(
    "select count(*) from hub_private.memberships where room_code='ABCDEF';",
  );
  assert.equal(count.output.trim(), "2");
  const listener = sql("listen hub_changes;select pg_sleep(2);");
  for (let i = 0; i < 30; i++) {
    const active = await sql(
      "select count(*) from pg_stat_activity where query like 'select pg_sleep%' and state='active';",
    );
    if (Number(active.output.trim()) > 0) break;
    if (i === 29) throw new Error("LISTEN session not ready");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const close = await sql(
    `${actor(1)}select public.hub_command('leave','ABCDEF');`,
  );
  assert.equal(close.code, 0, close.output);
  assert.ok(
    (await listener).output.includes("hub_changes"),
    "Committed change must notify another DB connection",
  );
  console.log(
    "PostgreSQL passed: permissions, transitions, concurrent capacity, committed notification",
  );
} finally {
  await docker(["rm", "-f", name]);
}
