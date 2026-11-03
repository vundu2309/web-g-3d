import assert from "node:assert/strict";
import test from "node:test";
import { Trace } from "../src/hub/diagnostics.ts";

test("overlapping stages preserve wall time, retry and immutable final report", async () => {
  let clock = 0;
  const reports = [];
  const trace = new Trace(
    "create",
    "online",
    (r) => reports.push(r),
    () => clock,
  );
  const attempt = trace.attempt();
  const read = trace.begin("room_read", attempt);
  clock = 10;
  const profile = trace.begin("profile_read", attempt);
  clock = 30;
  read();
  profile();
  const commit = trace.begin("commit_wait", attempt);
  clock = 50;
  commit("retry");
  commit();
  trace.attempt();
  clock = 70;
  trace.finish();
  const last = reports.at(-1);
  assert.equal(last.totalMs, 70);
  assert.equal(last.attempts, 2);
  assert.deepEqual(
    last.samples.map((s) => [s.ms, s.outcome]),
    [
      [30, "ok"],
      [20, "ok"],
      [20, "retry"],
    ],
  );
  const count = reports.length;
  trace.attempt();
  trace.add("sdk", 0);
  trace.begin("render")();
  trace.finish("error");
  assert.equal(reports.length, count);
  assert.equal(reports[0].samples.length, 0);
});

test("errors retain safe codes without result or error payloads", async () => {
  let report;
  const trace = new Trace("join", "online", (r) => {
    report = r;
  });
  const secret = { email: "private@example.test", token: "secret-token" };
  assert.equal(await trace.measure("session", async () => secret), secret);
  const error = Object.assign(new Error(JSON.stringify(secret)), {
    code: "permission-denied",
    ...secret,
  });
  await assert.rejects(
    trace.measure("room_read", async () => {
      throw error;
    }),
  );
  trace.finish("error", error);
  assert.equal(report.code, "permission-denied");
  assert.equal(report.samples[1].code, "permission-denied");
  assert.doesNotMatch(JSON.stringify(report), /private|secret-token|email/);
});

test("bounded samples, invalid error codes and pending termination", () => {
  let report;
  const trace = new Trace("join", "demo", (r) => {
    report = r;
  });
  trace.begin("first_snapshot");
  for (let i = 0; i < 120; i++) trace.add("sdk", trace.time(), "cached");
  trace.finish("error", { code: "private@example.test" });
  assert.equal(report.samples.length, 100);
  assert.equal(report.samples[0].outcome, "unfinished");
  assert.equal(report.code, undefined);
});
