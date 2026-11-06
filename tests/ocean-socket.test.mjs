import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { io as connect } from "socket.io-client";
import { attachSockets } from "../server/socket.mjs";
import { attachOcean } from "../server/ocean.mjs";
test("shared sea: separate authenticated boats, push sync, identity ownership, duplicate replacement and leave", async () => {
  const server = createServer();
  let clock = 1000;
  let revoked = false;
  const authenticate = async (token) =>
    ["minh", "lan"].includes(token) && !(token === "minh" && revoked)
      ? { id: token, user_metadata: { display_name: token } }
      : null;
  const io = attachSockets(server, {
    origins: ["https://sea.test"],
    authenticate,
    snapshot: async () => null,
  });
  attachOcean(io, { authenticate, now: () => clock, tickMs: 20 });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const make = (token) =>
    connect(base, {
      transports: ["websocket"],
      reconnection: false,
      autoConnect: false,
      auth: { token },
    });
  const minh = make("minh"),
    lan = make("lan"),
    duplicate = make("minh"),
    watcher = make("lan");
  const command = (socket, input) =>
    socket.timeout(2000).emitWithAck("ocean:command", input);
  const join = (socket) => command(socket, { action: "join" });
  try {
    const connections = Promise.all(
      [minh, lan, watcher].map((socket) => {
        const connected = once(socket, "connect");
        socket.connect();
        return connected;
      }),
    );
    await connections;
    let leaked = false;
    watcher.on("ocean:state", () => {
      leaked = true;
    });
    assert.ok(
      (
        await command(watcher, {
          action: "move",
          pose: { x: 0, z: 0, heading: 0, fishing: false },
        })
      ).error,
      "must enter sea first",
    );
    assert.ok((await join(minh)).data.pose);
    let update = once(minh, "ocean:state");
    const entry = once(lan, "ocean:state");
    assert.ok((await join(lan)).data.pose);
    const snapshot = (await entry)[0];
    assert.equal(snapshot.full, true);
    assert.deepEqual(snapshot.boats.map((b) => b.uid).sort(), ["lan", "minh"]);
    let state = (await update)[0];
    assert.equal(state.full, false, "others receive only the changed boat");
    assert.ok(state.boats.some((b) => b.uid === "lan"));
    clock += 1000;
    const moved = new Promise((resolve) => {
      const seen = (value) => {
        if (value.boats.find((b) => b.uid === "minh")?.x === 10) {
          lan.off("ocean:state", seen);
          resolve(value);
        }
      };
      lan.on("ocean:state", seen);
    });
    assert.equal(
      (
        await command(minh, {
          action: "move",
          uid: "lan",
          pose: { x: 10, z: 2, heading: 1, fishing: true },
        })
      ).data,
      true,
    );
    state = await moved;
    assert.equal(state.boats.find((b) => b.uid === "minh").x, 10);
    assert.equal(state.full, false);
    clock += 1000;
    for (const bad of [
      { x: Infinity },
      { x: 181 },
      { heading: 9 },
      { extra: true },
      { fishing: "yes" },
    ])
      assert.ok(
        (
          await command(minh, {
            action: "move",
            pose: { x: 0, z: 0, heading: 0, fishing: false, ...bad },
          })
        ).error,
      );
    const connected = once(duplicate, "connect");
    duplicate.connect();
    await connected;
    const replaced = once(minh, "ocean:error");
    assert.ok((await join(duplicate)).data.pose);
    await replaced;
    clock += 1000;
    assert.ok(
      (
        await command(minh, {
          action: "move",
          pose: { x: 0, z: 0, heading: 0, fishing: false },
        })
      ).error,
    );
    update = once(lan, "ocean:state");
    duplicate.disconnect();
    assert.deepEqual((await update)[0].removed, ["minh"]);
    clock += 1000;
    await join(minh); // A socket cannot rejoin after its lease was replaced.
    revoked = true;
    clock += 1000;
    assert.ok(
      (
        await command(minh, {
          action: "move",
          pose: { x: 0, z: 0, heading: 0, fishing: false },
        })
      ).error,
    );
    assert.equal(
      leaked,
      false,
      "authenticated hub sockets do not receive sea snapshots before entry",
    );
  } finally {
    for (const socket of [minh, lan, duplicate, watcher]) socket.disconnect();
    await new Promise((resolve) => io.close(resolve));
    await new Promise((resolve) => server.close(resolve));
  }
});

test("shared sea: moves reuse a validated token, batch per tick, recheck and accept refreshed tokens", async () => {
  const server = createServer();
  let clock = 1000;
  let calls = 0;
  const valid = new Set(["minh", "minh2"]);
  const authenticate = async (token) => {
    calls++;
    return valid.has(token) ? { id: "minh", user_metadata: {} } : null;
  };
  const io = attachSockets(server, {
    origins: ["https://sea.test"],
    authenticate,
    snapshot: async () => null,
  });
  attachOcean(io, {
    authenticate,
    now: () => clock,
    tickMs: 20,
    recheckMs: 60000,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const socket = connect(`http://127.0.0.1:${server.address().port}`, {
    transports: ["websocket"],
    reconnection: false,
    autoConnect: false,
    auth: { token: "minh" },
  });
  const command = (input) =>
    socket.timeout(2000).emitWithAck("ocean:command", input);
  const pose = (x) => ({ x, z: 0, heading: 0, fishing: false });
  try {
    const connected = once(socket, "connect");
    socket.connect();
    await connected;
    await command({ action: "join" });
    const afterJoin = calls;
    const states = [];
    socket.on("ocean:state", (state) => states.push(state));
    for (let x = 1; x <= 3; x++) {
      clock += 500;
      assert.equal(
        (await command({ action: "move", pose: pose(x) })).data,
        true,
      );
    }
    assert.equal(calls, afterJoin, "moves do not call Auth again");
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.ok(states.length >= 1 && states.length <= 3);
    assert.equal(states.at(-1).boats[0].x, 3);
    // Refresh before the recheck interval, then the new token is what gets rechecked.
    clock += 5000;
    assert.equal(
      (
        await socket
          .timeout(2000)
          .emitWithAck("ocean:token", { token: "minh2" })
      ).data,
      true,
    );
    assert.equal(calls, afterJoin + 1);
    clock += 61000;
    valid.delete("minh");
    assert.equal((await command({ action: "move", pose: pose(4) })).data, true);
    assert.equal(calls, afterJoin + 2, "stale validation asks Auth once");
    valid.delete("minh2");
    clock += 61000;
    const closed = once(socket, "disconnect");
    assert.ok((await command({ action: "move", pose: pose(5) })).error);
    await closed;
  } finally {
    socket.disconnect();
    await new Promise((resolve) => io.close(resolve));
    await new Promise((resolve) => server.close(resolve));
  }
});
