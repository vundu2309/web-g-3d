import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { io as connect } from "socket.io-client";
import { attachSockets } from "../server/socket.mjs";
import { listenForChanges } from "../server/notifications.mjs";
import { EventEmitter } from "node:events";

test("Socket.IO authenticates, pushes committed invalidations, and rechecks authorization after reconnect", async () => {
  const server = createServer();
  let revoked = false;
  let version = 1;
  const io = attachSockets(server, {
    origins: ["https://game.test"],
    authenticate: async (token) =>
      token === "valid" && !revoked ? { id: "player" } : null,
    snapshot: async (_token, input) => {
      if (input.action === "get" && input.code !== "ABCDEF")
        throw new Error("not a member");
      return { version };
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const options = {
    transports: ["websocket"],
    reconnection: false,
    autoConnect: false,
  };
  const first = connect(url, { ...options, auth: { token: "valid" } });
  const second = connect(url, { ...options, auth: { token: "valid" } });
  const invalid = connect(url, { ...options, auth: { token: "invalid" } });
  const wrongOrigin = connect(url, {
    ...options,
    auth: { token: "valid" },
    extraHeaders: { Origin: "https://evil.test" },
  });
  const get = (socket) =>
    socket
      .timeout(2000)
      .emitWithAck("hub:snapshot", { action: "get", code: "ABCDEF" });
  try {
    const denied = once(invalid, "connect_error");
    invalid.connect();
    await denied;
    assert.equal(invalid.connected, false);
    const blocked = once(wrongOrigin, "connect_error");
    wrongOrigin.connect();
    await blocked;
    assert.equal(wrongOrigin.connected, false);
    const connected = Promise.all([
      once(first, "connect"),
      once(second, "connect"),
    ]);
    first.connect();
    second.connect();
    await connected;
    assert.deepEqual((await get(first)).data, { version: 1 });
    assert.ok(
      (
        await first
          .timeout(2000)
          .emitWithAck("hub:snapshot", { action: "get", code: "ZZZZZZ" })
      ).error,
    );
    const updates = Promise.all([
      once(first, "hub:changed"),
      once(second, "hub:changed"),
    ]);
    version = 2;
    io.emit("hub:changed");
    assert.deepEqual(await updates, [[], []]); // No room data is broadcast.
    assert.deepEqual((await get(second)).data, { version: 2 });
    first.disconnect();
    version = 3;
    const reconnected = once(first, "connect");
    first.connect();
    await reconnected;
    assert.deepEqual((await get(first)).data, { version: 3 });
    revoked = true;
    assert.ok((await get(first)).error);
  } finally {
    first.disconnect();
    second.disconnect();
    invalid.disconnect();
    wrongOrigin.disconnect();
    await new Promise((resolve) => io.close(resolve));
    await new Promise((resolve) => server.close(resolve));
  }
});

test("PostgreSQL listener recovers missed messages by invalidating after LISTEN and closes cleanly", async () => {
  let client;
  class FakeClient extends EventEmitter {
    constructor(config) {
      super();
      client = this;
      assert.equal(config.ssl.rejectUnauthorized, true);
      assert.match(config.ssl.ca, /BEGIN CERTIFICATE/);
    }
    async connect() {}
    async query(sql) {
      assert.equal(sql, "LISTEN hub_changes");
    }
    async end() {}
  }
  const ready = [];
  const reasons = [];
  let changes = 0;
  const listener = listenForChanges({
    connectionString: "postgresql://test",
    Client: FakeClient,
    log: (reason) => reasons.push(reason),
    ready: (value) => ready.push(value),
    changed: () => changes++,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(listener.isReady(), true);
  assert.equal(changes, 1);
  client.emit("notification", { channel: "hub_changes" });
  assert.equal(changes, 2);
  client.emit("error", new Error("connection lost: secret-password"));
  assert.deepEqual(reasons, ["CONNECTION_FAILED"]);
  assert.equal(listener.isReady(), false);
  assert.deepEqual(ready, [true, false]);
  await listener.close();
});
