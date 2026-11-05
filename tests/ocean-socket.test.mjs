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
  attachOcean(io, { authenticate, now: () => clock });
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
    assert.ok((await join(lan)).data.pose);
    let state = (await update)[0];
    assert.equal(state.boats.length, 2);
    assert.deepEqual(state.boats.map((b) => b.uid).sort(), ["lan", "minh"]);
    clock += 1000;
    update = once(lan, "ocean:state");
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
    state = (await update)[0];
    assert.equal(state.boats.find((b) => b.uid === "minh").x, 10);
    assert.notEqual(state.boats.find((b) => b.uid === "lan").x, 10);
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
    assert.equal((await update)[0].boats.length, 1);
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
