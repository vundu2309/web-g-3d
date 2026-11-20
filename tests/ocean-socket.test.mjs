import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { io as connect } from "socket.io-client";
import { attachSockets } from "../server/socket.mjs";
import { attachOcean } from "../server/ocean.mjs";
import { SEA_BOUND } from "../src/ocean/model.ts";
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
    // Wait for the snapshot with both boats: minh's own entering snapshot (one boat) may still be on
    // its way when lan joins, and must not be taken for it.
    const bothBoats = new Promise((resolve) =>
      minh.on("ocean:state", function seen(value) {
        if (value.boats.length < 2) return;
        minh.off("ocean:state", seen);
        resolve([value]);
      }),
    );
    assert.ok((await join(lan)).data.pose);
    let state = (await bothBoats)[0];
    assert.equal(state.boats.length, 2);
    let update;
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
      { x: SEA_BOUND + 1 },
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
    assert.deepEqual(
      rows[0],
      ["ann", 1, 1, 0.5, 0, clock],
      "a move is stamped with when it happened, not with the tick that carried it",
    );
    assert.ok(
      bDeltas.every((d) => d.up.every((r) => r[5] <= d.t)),
      "never later than the delta that carries it",
    );
    assert.ok(bDeltas.length <= 2, "changes go out per tick, not per command");
    clock += 1000;
    a.emit("ocean:move", { ...pose(5), fishing: true });
    await wait(100);
    assert.deepEqual(
      bDeltas
        .flatMap((d) => d.up)
        .filter((r) => r[0] === "ann")
        .at(-1),
      ["ann", 5, 1, 0.5, 1, clock],
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

test("shared sea: every boat carries its boat and rod tier, read from the account with the player's own token, never from the client", async () => {
  const server = createServer();
  let clock = 1000;
  const ids = { ta: "ann", tb: "bao", tc: "cam", td: "dung" };
  const authenticate = async (token) =>
    ids[token]
      ? { id: ids[token], user_metadata: { display_name: ids[token] } }
      : null;
  // What each account owns now; dung's account cannot be read, cam's read is slow.
  const owned = {
    ann: { boat: 2, rod: 3 },
    bao: { boat: 1, rod: 0 },
    cam: { boat: 3, rod: 3 },
  };
  const reads = [];
  let failRead = false;
  const loadoutOf = async (token) => {
    reads.push(token);
    if (failRead) throw new Error("economy unreachable");
    if (token === "td") throw new Error("economy unreachable");
    if (token === "tc")
      await new Promise((resolve) => setTimeout(resolve, 300));
    return { ...owned[ids[token]], bait: 1, baitUsed: 1 };
  };
  const io = attachSockets(server, {
    origins: ["https://sea.test"],
    authenticate,
  });
  attachOcean(io, {
    authenticate,
    now: () => clock,
    tickMs: 30,
    loadoutOf,
    fitWaitMs: 100,
    minRefitMs: 150,
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
  const join = (socket, proto = 2) =>
    socket
      .timeout(3000)
      .emitWithAck("ocean:command", { action: "join", proto });
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const sockets = [];
  const next = async (token) => {
    const socket = await open(token);
    sockets.push(socket);
    return socket;
  };
  try {
    const ta = await next("ta");
    const fullState = once(ta, "ocean:state");
    await join(ta);
    const mine = (await fullState)[0].boats.find((b) => b.uid === "ann");
    assert.equal(mine.tier, 2);
    assert.equal(mine.rod, 3);
    assert.deepEqual(reads, ["ta"], "read with the player's own token, once");

    // others learn the tiers of a boat that enters, from the delta's `add` entry
    const deltas = [];
    ta.on("ocean:delta", (value) => deltas.push(value));
    const tb = await next("tb");
    const bState = once(tb, "ocean:state");
    await join(tb);
    const seen = (await bState)[0].boats;
    assert.deepEqual(seen.map((b) => [b.uid, b.tier, b.rod]).sort(), [
      ["ann", 2, 3],
      ["bao", 1, 0],
    ]);
    await wait(80);
    const added = deltas.flatMap((d) => d.add).find((b) => b.uid === "bao");
    assert.equal(added.tier, 1);
    assert.equal(added.rod, 0);

    // an account that cannot be read, and one that is read too slowly, are the first boat and rod
    const td = await next("td");
    await join(td);
    const tc = await next("tc");
    const started = Date.now();
    await join(tc);
    assert.ok(
      Date.now() - started < 280,
      "entering does not wait for a slow read",
    );
    await wait(80);
    const everyAdd = deltas.flatMap((d) => d.add);
    const cam = everyAdd.find((b) => b.uid === "cam");
    const dung = everyAdd.find((b) => b.uid === "dung");
    assert.deepEqual(
      [cam.tier, cam.rod],
      [0, 0],
      "slow read: the first boat and rod",
    );
    assert.deepEqual(
      [dung.tier, dung.rod],
      [0, 0],
      "failed read: the first boat and rod",
    );

    // a purchase: the client only says so; the server reads the account again and tells the others
    const refits = [];
    ta.on("ocean:refit", (value) => refits.push(value));
    owned.bao = { boat: 3, rod: 2 };
    const lies = { tier: 3, rod: 3, uid: "ann" };
    tb.emit("ocean:refit", lies); // whatever the client sends is ignored
    await wait(120);
    assert.deepEqual(refits, [{ uid: "bao", tier: 3, rod: 2 }]);
    // too soon after: not applied at once (rate limited) but not dropped either: done once the gap is over
    owned.bao = { boat: 0, rod: 0 };
    tb.emit("ocean:refit");
    tb.emit("ocean:refit");
    await wait(60);
    assert.equal(refits.length, 1, "rate limited: nothing yet");
    await wait(220);
    assert.deepEqual(
      refits.map((r) => [r.tier, r.rod]),
      [
        [3, 2],
        [0, 0],
      ],
      "the second change reaches the others once, after the gap",
    );
    // a read that fails or is slow leaves the boat as it is: nobody is demoted by a hiccup
    owned.bao = { boat: 2, rod: 1 };
    failRead = true;
    clock += 1000;
    tb.emit("ocean:refit");
    await wait(200);
    assert.equal(refits.length, 2, "a failed read changes nothing");
    failRead = false;
    clock += 1000;
    tb.emit("ocean:refit");
    await wait(120);
    assert.deepEqual(refits.at(-1), { uid: "bao", tier: 2, rod: 1 });
    // nothing changed: nothing is sent
    clock += 1000;
    const count = refits.length;
    tb.emit("ocean:refit");
    await wait(120);
    assert.equal(refits.length, count, "quiet when nothing changed");
    // a socket that never joined cannot refit anyone
    const stranger = await next("ta");
    owned.ann = { boat: 0, rod: 0 };
    stranger.emit("ocean:refit");
    await wait(120);
    assert.equal(refits.length, count, "not joined: ignored");
  } finally {
    for (const socket of sockets) socket.close();
    await new Promise((resolve) => server.close(resolve));
    io.close();
  }
});

test("shared sea: an older client gets the full snapshot with the extra fields it ignores, and never the refit event", async () => {
  const server = createServer();
  const authenticate = async (token) =>
    token === "old" || token === "new"
      ? { id: token, user_metadata: { display_name: token } }
      : null;
  const io = attachSockets(server, {
    origins: ["https://sea.test"],
    authenticate,
  });
  attachOcean(io, {
    authenticate,
    tickMs: 30,
    minRefitMs: 0,
    loadoutOf: async () => ({ boat: 2, rod: 1 }),
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
  const old = await open("old");
  const fresh = await open("new");
  try {
    const states = [];
    old.on("ocean:state", (value) => states.push(value));
    const refits = [];
    old.on("ocean:refit", (value) => refits.push(value));
    assert.ok(
      (await old.timeout(3000).emitWithAck("ocean:command", { action: "join" }))
        .data.pose,
    );
    await fresh
      .timeout(3000)
      .emitWithAck("ocean:command", { action: "join", proto: 2 });
    await wait(120);
    const boats = states.at(-1).boats;
    assert.deepEqual(boats.map((b) => b.uid).sort(), ["new", "old"]);
    for (const boat of boats) assert.deepEqual([boat.tier, boat.rod], [2, 1]);
    for (const key of [
      "uid",
      "name",
      "x",
      "z",
      "heading",
      "fishing",
      "updatedAt",
    ])
      assert.ok(key in boats[0], `${key} is still there`);
    fresh.emit("ocean:refit");
    await wait(150);
    assert.deepEqual(refits, [], "an older client is never sent the new event");
  } finally {
    old.close();
    fresh.close();
    await new Promise((resolve) => server.close(resolve));
    io.close();
  }
});
