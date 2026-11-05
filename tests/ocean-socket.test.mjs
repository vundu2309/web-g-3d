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
  attachOcean(io, { authenticate, now: () => clock, tickMs: 30 });
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

test("shared sea protocol 2: synchronous moves, per-tick deltas, rate limit, token renewal and timed session checks", async () => {
  const server = createServer();
  let clock = 1000;
  let providerDown = false;
  let checks = 0;
  const valid = new Set(["a", "b"]);
  const ids = { a: "ann", a2: "ann", b: "bao" };
  const authenticate = async (token) => {
    checks++;
    if (providerDown) throw new Error("unavailable");
    return valid.has(token)
      ? { id: ids[token], user_metadata: { display_name: ids[token] } }
      : null;
  };
  const io = attachSockets(server, {
    origins: ["https://sea.test"],
    authenticate,
    snapshot: async () => null,
  });
  attachOcean(io, {
    authenticate,
    now: () => clock,
    tickMs: 30,
    authRecheckMs: 250,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const open = async (token) => {
    const socket = connect(base, {
      transports: ["websocket"],
      reconnection: false,
      autoConnect: false,
      auth: { token },
    });
    const connected = once(socket, "connect");
    socket.connect();
    await connected;
    return socket;
  };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const pose = (x) => ({ x, z: 1, heading: 0.5, fishing: false });
  const join = (socket) =>
    socket
      .timeout(2000)
      .emitWithAck("ocean:command", { action: "join", proto: 2 });
  const a = await open("a");
  const b = await open("b");
  try {
    const fullState = once(a, "ocean:state");
    const joined = await join(a);
    assert.equal(joined.data.proto, 2);
    assert.equal(joined.data.sendMs, 30);
    assert.deepEqual(
      (await fullState)[0].boats.map((x) => x.uid),
      ["ann"],
    );
    const deltas = [];
    a.on("ocean:delta", (value) => deltas.push(value));
    const bState = once(b, "ocean:state");
    await join(b);
    assert.equal(
      (await bState)[0].boats.length,
      2,
      "a joiner gets a full snapshot",
    );
    await wait(60);
    assert.ok(
      deltas.some((d) =>
        d.add.some((boat) => boat.uid === "bao" && boat.name === "bao"),
      ),
      "others learn of a new boat, name included, from a delta",
    );

    // Moves are plain events with no authentication round trip and no acknowledgement.
    const bDeltas = [];
    b.on("ocean:delta", (value) => bDeltas.push(value));
    const before = checks;
    clock += 1000;
    for (let i = 1; i <= 10; i++) a.emit("ocean:move", pose(i));
    await wait(150);
    // Only the timed session checks (two sockets, one every 250 ms) may call it.
    assert.ok(
      checks - before <= 2,
      `moves never call the Auth provider (${checks - before} calls)`,
    );
    const rows = bDeltas.flatMap((d) => d.up).filter((r) => r[0] === "ann");
    assert.equal(
      rows.length,
      1,
      "ten moves inside the rate limit are one accepted move",
    );
    assert.deepEqual(rows[0], ["ann", 1, 1, 0.5, 0]);
    assert.ok(bDeltas.length <= 2, "changes go out per tick, not per command");
    clock += 1000;
    a.emit("ocean:move", { ...pose(5), fishing: true });
    await wait(100);
    assert.deepEqual(
      bDeltas
        .flatMap((d) => d.up)
        .filter((r) => r[0] === "ann")
        .at(-1),
      ["ann", 5, 1, 0.5, 1],
    );
    clock += 1000;
    a.emit("ocean:move", { ...pose(Infinity) });
    a.emit("ocean:move", { x: 1 });
    await wait(100);
    assert.equal(
      bDeltas
        .flatMap((d) => d.up)
        .filter((r) => r[1] === null || r[1] === Infinity).length,
      0,
      "invalid poses are ignored",
    );

    // The session is checked on a timer. A renewed token keeps the connection; the
    // provider being down does not end it; a revoked session does.
    valid.add("a2");
    assert.equal(
      (await a.timeout(2000).emitWithAck("ocean:token", { token: "a2" })).data,
      true,
    );
    assert.ok(
      (await b.timeout(2000).emitWithAck("ocean:token", { token: "a2" })).error,
      "a token of another account is refused",
    );
    valid.delete("a");
    providerDown = true;
    await wait(600);
    assert.equal(
      a.connected,
      true,
      "outage of the Auth provider keeps the boat afloat",
    );
    providerDown = false;
    await wait(600);
    assert.equal(
      a.connected,
      true,
      "the renewed token is the one that is checked",
    );
    const kicked = once(a, "ocean:error");
    const left = once(b, "ocean:delta");
    valid.delete("a2");
    assert.equal((await kicked)[0].error, "Hãy đăng nhập lại.");
    let removal = (await left)[0];
    while (!removal.gone.includes("ann"))
      removal = (await once(b, "ocean:delta"))[0];
    assert.equal(a.connected, false);
  } finally {
    for (const socket of [a, b]) socket.disconnect();
    await new Promise((resolve) => io.close(resolve));
    await new Promise((resolve) => server.close(resolve));
  }
});
