import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { createRoom, applyCommand } from "../src/hub/model.ts";

const projectId = "demo-photyphu";
const emulatorHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
if (!/^127\.0\.0\.1:\d+$/.test(emulatorHost || ""))
  throw new Error("Only a loopback Database emulator is permitted");
const env = await initializeTestEnvironment({
  projectId,
  database: { rules: await readFile("database.rules.json", "utf8") },
});
const roomPath = "monopolyHub/v1/rooms/AB7K2M";
// Unsigned emulator-only identity. This token is never accepted by production Firebase.
function mockToken(uid) {
  const b64 = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: uid, user_id: uid, aud: projectId, iss: `https://securetoken.google.com/${projectId}`, iat: now, exp: now + 3600, auth_time: now, firebase: { sign_in_provider: "custom", identities: {} } })}.`;
}
async function request(uid, path, value, method = "PUT", headers = {}) {
  const url = new URL(`http://${emulatorHost}/${path}.json`);
  url.searchParams.set("ns", projectId);
  if (uid) url.searchParams.set("auth", mockToken(uid));
  return fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: method === "GET" ? undefined : JSON.stringify(value),
    signal: AbortSignal.timeout(4000),
  });
}
async function allowed(promise) {
  const response = await promise;
  assert.equal(response.status, 200, await response.text());
}
async function denied(promise) {
  const response = await promise;
  const body = await response.text();
  assert.ok(
    [401, 403].includes(response.status),
    `${response.status}: ${body}`,
  );
  assert.match(body, /permission.denied/i);
}
try {
  await test("RTDB rules reject invalid ownership, capacity, direct readiness bypass and unauthorized deletion", async () => {
    let room = createRoom("host", "Minh", 2);
    await denied(request("guest", roomPath, room));
    await denied(request(null, roomPath, undefined, "GET"));
    await allowed(request("host", roomPath, room));
    await denied(request("host", "monopolyHub/v1/rooms", undefined, "GET"));
    await denied(request("host", roomPath, { ...room, capacity: 4 }));
    await denied(
      request("outsider", roomPath, { ...room, hostId: "outsider" }),
    );
    room = applyCommand(room, { type: "join", uid: "guest", name: "Lan" });
    await allowed(request("guest", roomPath, room));
    await denied(
      request("outsider", roomPath, {
        ...room,
        seats: { ...room.seats, 2: "outsider" },
        players: {
          ...room.players,
          outsider: { name: "Huy", seat: 2, ready: false },
        },
      }),
    );
    await denied(request("guest", roomPath, null));
    await denied(request("guest", `${roomPath}/players/host`, null));
    await denied(request("guest", `${roomPath}/seats/0`, null));
    await denied(request("guest", roomPath, { hostId: "guest" }, "PATCH"));
    await denied(request("guest", `${roomPath}/players/host/ready`, false));
    await denied(request("host", `${roomPath}/status`, "started"));
    await denied(request("host", roomPath, { ...room, status: "started" }));
    await denied(request("guest", roomPath, { ...room, status: "started" }));
    room = applyCommand(room, { type: "ready", uid: "guest", ready: true });
    await allowed(request("guest", roomPath, room));
    await denied(request("guest", roomPath, { ...room, status: "started" }));
    // Compare-and-swap genuinely rejects a stale writer (same protocol as online adapter).
    const snapshot = await request("host", roomPath, undefined, "GET", {
      "X-Firebase-ETag": "true",
    });
    const etag = snapshot.headers.get("ETag");
    assert.ok(etag);
    room = applyCommand(room, { type: "start", uid: "host" });
    await allowed(request("host", roomPath, room, "PUT", { "if-match": etag }));
    const conflict = await request("host", roomPath, room, "PUT", {
      "if-match": etag,
    });
    assert.equal(conflict.status, 412);
    await denied(request("guest", `${roomPath}/players/guest/ready`, false));
    await allowed(
      request(
        "guest",
        roomPath,
        applyCommand(room, { type: "leave", uid: "guest" }),
      ),
    );
    await allowed(request("host", roomPath, null));
  });
} finally {
  await env.cleanup();
}
