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

/**
 * A sea in which the test decides when, and how, each of bao's refit reads answers. The reads of a
 * join answer at once with the first boat and rod. `clock` is only moved by the test, so a second
 * refit read can start while the first is still waiting.
 */
async function heldReads({ fitWaitMs }) {
  const server = createServer();
  let clock = 1000;
  const ids = { ta: "ann", tb: "bao", tc: "cam" };
  const authenticate = async (token) =>
    ids[token]
      ? { id: ids[token], user_metadata: { display_name: ids[token] } }
      : null;
  let holding = false;
  let started = () => {};
  const loadoutOf = (token) => {
    if (!holding || token !== "tb") return Promise.resolve({ boat: 0, rod: 0 });
    return new Promise((resolve, reject) => started({ resolve, reject }));
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
    fitWaitMs,
    minRefitMs: 2000,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const sockets = [];
  const enter = async (token) => {
    const socket = connect(base, {
      transports: ["websocket"],
      reconnection: false,
      autoConnect: false,
      auth: { token },
    });
    sockets.push(socket);
    const connected = once(socket, "connect");
    socket.connect();
    await connected;
    const state = once(socket, "ocean:state");
    await socket
      .timeout(3000)
      .emitWithAck("ocean:command", { action: "join", proto: 2 });
    return { socket, boats: (await state)[0].boats };
  };
  const ann = (await enter("ta")).socket;
  const bao = (await enter("tb")).socket;
  const refits = [];
  ann.on("ocean:refit", (value) => refits.push(value));
  holding = true;
  return {
    refits,
    /** bao asks for a refit, after the gap; resolves with the read the server then starts. */
    async ask() {
      clock += 2000;
      const read = new Promise((resolve, reject) => {
        const late = setTimeout(
          () => reject(new Error("no refit read was started")),
          3000,
        );
        started = (held) => {
          clearTimeout(late);
          resolve(held);
        };
      });
      bao.emit("ocean:refit");
      return read;
    },
    /**
     * Resolves once ann has everything the server sent her up to now: the answer to this (invalid,
     * so without effect) command follows it on the same connection.
     */
    settled: () => ann.timeout(3000).emitWithAck("ocean:command", {}),
    /** bao's boat and rod as a player entering now is told them. */
    async shown() {
      const { socket, boats } = await enter("tc");
      socket.disconnect();
      const boat = boats.find((b) => b.uid === "bao");
      return [boat.tier, boat.rod];
    },
    async close() {
      for (const socket of sockets) socket.close();
      await new Promise((resolve) => server.close(resolve));
      io.close();
    },
  };
}

test("shared sea: a slow, older refit read does not replace what a later-started read has applied", async () => {
  const sea = await heldReads({ fitWaitMs: 10_000 });
  try {
    const older = await sea.ask();
    const newer = await sea.ask();
    newer.resolve({ boat: 3, rod: 2 });
    await sea.settled();
    assert.deepEqual(sea.refits, [{ uid: "bao", tier: 3, rod: 2 }]);
    older.resolve({ boat: 1, rod: 1 });
    await sea.settled();
    assert.deepEqual(
      sea.refits,
      [{ uid: "bao", tier: 3, rod: 2 }],
      "the older answer sends nothing",
    );
    assert.deepEqual(
      await sea.shown(),
      [3, 2],
      "the boat keeps the newer tiers",
    );

    // The same when the later answer changed nothing: it is still the newer word on the account.
    const stale = await sea.ask();
    const same = await sea.ask();
    same.resolve({ boat: 3, rod: 2 });
    await sea.settled();
    stale.resolve({ boat: 2, rod: 0 });
    await sea.settled();
    assert.equal(sea.refits.length, 1, "nothing is sent");
    assert.deepEqual(await sea.shown(), [3, 2]);
  } finally {
    await sea.close();
  }
});

test("shared sea: when a later refit read fails or times out, the earlier read's answer is still applied", async () => {
  const sea = await heldReads({ fitWaitMs: 1000 });
  try {
    // the later read fails before the earlier one answers
    const first = await sea.ask();
    const failing = await sea.ask();
    failing.reject(new Error("economy unreachable"));
    await sea.settled();
    first.resolve({ boat: 1, rod: 1 });
    await sea.settled();
    assert.deepEqual(
      sea.refits,
      [{ uid: "bao", tier: 1, rod: 1 }],
      "after a failed later read",
    );
    // the later read is never answered: the earlier answer counts, also after the later is given up
    const second = await sea.ask();
    await sea.ask();
    second.resolve({ boat: 2, rod: 3 });
    await sea.settled();
    assert.deepEqual(
      sea.refits.at(-1),
      { uid: "bao", tier: 2, rod: 3 },
      "while a later read is still waiting",
    );
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await sea.settled();
    assert.equal(sea.refits.length, 2);
    assert.deepEqual(await sea.shown(), [2, 3]);
  } finally {
    await sea.close();
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

test("shared sea: a boat whose player leaves stays where it was, for the protocol 2 clients; the database fills in the others; a returning player takes it back", async () => {
  const server = createServer();
  let clock = 1000;
  const ids = { ta: "ann", tb: "bao", tc: "cam", tl: "old-client" };
  const authenticate = async (token) =>
    ids[token]
      ? { id: ids[token], user_metadata: { display_name: ids[token] } }
      : null;
  // What the database says about the boats of players who are not online (one entry is wrong).
  let database = [
    {
      uid: "dai",
      name: "  Đại  ",
      x: 50,
      z: -20,
      heading: 1,
      tier: 1,
      rod: 2,
      age: 600,
    },
    {
      uid: "far",
      name: "Xa",
      x: 99999,
      z: 0,
      heading: 0,
      tier: 0,
      rod: 0,
      age: 1,
    },
    { name: "no uid", x: 1, z: 1, heading: 0, age: 1 },
  ];
  const reads = [];
  let unreachable = false;
  const parkedOf = async (token) => {
    reads.push(token);
    if (unreachable) throw new Error("database unreachable");
    return database;
  };
  const io = attachSockets(server, {
    origins: ["https://sea.test"],
    authenticate,
  });
  attachOcean(io, {
    authenticate,
    now: () => clock,
    tickMs: 30,
    parkedOf,
    parkedTtlMs: 1000,
    fitWaitMs: 200,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const sockets = [];
  const next = async (token) => {
    const socket = connect(base, {
      transports: ["websocket"],
      reconnection: false,
      autoConnect: false,
      auth: { token },
    });
    const connected = once(socket, "connect");
    socket.connect();
    await connected;
    sockets.push(socket);
    return socket;
  };
  const join = (socket, proto = 2) =>
    socket
      .timeout(3000)
      .emitWithAck("ocean:command", { action: "join", proto });
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const parkedIds = (state) =>
    state.boats
      .filter((b) => b.off)
      .map((b) => b.uid)
      .sort();
  try {
    // The first player entering reads the database with their own token and sees the parked boat
    // of a player who is not online; the wrong entries are left out and the name is trimmed.
    const ta = await next("ta");
    const first = once(ta, "ocean:state");
    await join(ta);
    const state = (await first)[0];
    assert.deepEqual(reads, ["ta"]);
    assert.deepEqual(parkedIds(state), ["dai"]);
    const dai = state.boats.find((b) => b.uid === "dai");
    assert.deepEqual(
      [dai.name, dai.x, dai.z, dai.heading, dai.tier, dai.rod, dai.fishing],
      ["Đại", 50, -20, 1, 1, 2, false],
    );
    assert.ok(
      state.boats.find((b) => b.uid === "ann" && !b.off),
      "the online boat is not parked",
    );

    // Everything that happens next, as ann sees it.
    const deltas = [];
    ta.on("ocean:delta", (value) => deltas.push(value));
    const tb = await next("tb");
    await join(tb);
    clock += 200;
    tb.emit("ocean:move", { x: 30, z: 40, heading: 0.5, fishing: true });
    await wait(80);
    assert.equal(reads.length, 1, "asked once within the time to live");

    // bao leaves: the boat stays at its last pose, as a parked entry in place of the online one
    // (no `gone`), and nobody fishes from a parked boat.
    deltas.length = 0;
    tb.disconnect();
    await wait(120);
    const left = deltas.flatMap((d) => d.add).find((b) => b.uid === "bao");
    assert.deepEqual(
      [left.off, left.x, left.z, left.heading, left.fishing],
      [1, 30, 40, 0.5, false],
    );
    assert.ok(!deltas.some((d) => d.gone.includes("bao")), "not removed");

    // A player entering later sees both parked boats, and an older client sees none of them.
    const tc = await next("tc");
    const cam = once(tc, "ocean:state");
    await join(tc);
    assert.deepEqual(parkedIds((await cam)[0]), ["bao", "dai"]);
    const old = await next("tl");
    const oldState = once(old, "ocean:state");
    await old.timeout(3000).emitWithAck("ocean:command", { action: "join" });
    old.emit("ocean:command", { action: "move" }, () => {});
    const legacy = (await oldState)[0];
    assert.ok(
      legacy.boats.every((b) => !b.off) &&
        !legacy.boats.some((b) => ["bao", "dai"].includes(b.uid)),
      "an older client gets the online boats only",
    );

    // bao comes back: the others get the boat as an online one, and its own snapshot has no parked bao.
    deltas.length = 0;
    const tb2 = await next("tb");
    const back = once(tb2, "ocean:state");
    await join(tb2);
    assert.deepEqual(parkedIds((await back)[0]), ["dai"]);
    await wait(80);
    const again = deltas.flatMap((d) => d.add).find((b) => b.uid === "bao");
    assert.ok(again && !again.off, "online again");

    // The database later forgets the boat of dai (7 days passed): it is removed for everyone.
    // An unreachable database changes nothing and is asked again with the next player.
    database = [];
    unreachable = true;
    clock += 5000;
    deltas.length = 0;
    const tx = await next("tl");
    await old.disconnect();
    await wait(50);
    tx.disconnect();
    unreachable = false;
    const ty = await next("tl");
    await join(ty);
    await wait(100);
    assert.ok(
      deltas.some((d) => d.gone.includes("dai")),
      "a parked boat the database no longer lists is removed",
    );
  } finally {
    for (const socket of sockets) socket.disconnect();
    server.close();
  }
});

test("shared sea: boat paint is read from account loadout and parked boats, synced on refit, never trusted from client", async () => {
  const server = createServer();
  let clock = 1000;
  const ids = { ta: "ann", tb: "bao" };
  const authenticate = async (token) =>
    ids[token]
      ? { id: ids[token], user_metadata: { display_name: ids[token] } }
      : null;
  const owned = {
    ta: { boat: 1, rod: 0, paint: 4 },
    tb: { boat: 0, rod: 0, paint: null },
  };
  const parkedDb = [
    {
      uid: "dai",
      name: "Đài",
      x: 15,
      z: 25,
      heading: 0.2,
      tier: 2,
      rod: 1,
      paint: 7,
      age: 30,
    },
  ];
  const io = attachSockets(server, {
    origins: ["https://web-g-3d.vercel.app"],
    authenticate,
  });
  attachOcean(io, {
    authenticate,
    now: () => clock,
    tickMs: 40,
    minRefitMs: 50,
    loadoutOf: async (token) => owned[token],
    parkedOf: async () => parkedDb,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const sockets = [];
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const join = (s) =>
    s.timeout(3000).emitWithAck("ocean:command", { action: "join", proto: 2 });
  const next = async (token) => {
    const s = connect(`http://127.0.0.1:${port}`, {
      transports: ["websocket"],
      reconnection: false,
      auth: { token },
      extraHeaders: { origin: "https://web-g-3d.vercel.app" },
    });
    sockets.push(s);
    await once(s, "connect");
    return s;
  };
  try {
    const a = await next("ta");
    const aState = once(a, "ocean:state");
    await join(a);
    const snapA = (await aState)[0];
    assert.equal(snapA.boats.find((b) => b.uid === "ann")?.paint, 4);
    assert.equal(snapA.boats.find((b) => b.uid === "dai")?.paint, 7);

    const b = await next("tb");
    const bState = once(b, "ocean:state");
    await join(b);
    const snapB = (await bState)[0];
    assert.equal(snapB.boats.find((b) => b.uid === "ann")?.paint, 4);
    assert.equal(
      "paint" in (snapB.boats.find((b) => b.uid === "bao") ?? {}),
      false,
      "null paint is omitted for default UID palette",
    );

    // Client-sent paint payload is ignored; server reads updated account loadout on refit.
    const refits = [];
    b.on("ocean:refit", (ev) => refits.push(ev));
    owned.ta = { boat: 1, rod: 0, paint: 6 };
    clock += 100;
    a.emit("ocean:refit", { paint: 7 });
    await wait(120);
    assert.equal(refits.length, 1);
    assert.deepEqual(refits[0], { uid: "ann", tier: 1, rod: 0, paint: 6 });
  } finally {
    for (const socket of sockets) socket.disconnect();
    server.close();
  }
});
