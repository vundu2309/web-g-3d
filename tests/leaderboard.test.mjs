import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BOARD_SIZE,
  NAME_MAX,
  boardValue,
  emptyLeaderboard,
  ownPlace,
  readLeaderboard,
} from "../src/ocean/leaderboard.ts";
import { memoryEconomy } from "../src/ocean/economy-api.ts";

// The server's answer is read defensively: a malformed row is dropped, never thrown on.

const row = (rank, name, value, extra = {}) => ({
  rank,
  name,
  value,
  you: false,
  ...extra,
});

test("a well-formed answer is read as it is", () => {
  const board = readLeaderboard({
    caught: {
      players: 3,
      top: [row(1, "An", 50), row(1, "Bình", 50, { you: true })],
      me: { rank: 1, value: 50 },
    },
    heaviest: {
      players: 1,
      top: [row(1, "An", 41.25, { species: "rua-bien" })],
    },
  });
  assert.equal(board.caught.players, 3);
  assert.deepEqual(
    board.caught.top.map((r) => [r.rank, r.name, r.value, r.you]),
    [
      [1, "An", 50, false],
      [1, "Bình", 50, true],
    ],
  );
  assert.deepEqual(board.caught.me, { rank: 1, value: 50 });
  assert.equal(board.heaviest.top[0].species, "rua-bien");
});

test("garbage in, an empty board out", () => {
  for (const raw of [null, undefined, 7, "x", [], { caught: 5, heaviest: [] }])
    assert.deepEqual(readLeaderboard(raw), emptyLeaderboard());
});

test("bad rows are dropped, the good ones stay", () => {
  const board = readLeaderboard({
    caught: {
      players: 4,
      top: [
        row(1, "An", 9),
        row(0, "Rank zero", 9),
        row(2, "", 9),
        row(2, "   ", 9),
        row(3, "Negative", -4),
        row(3, "NaN", Number.NaN),
        { rank: 3, name: 12, value: 3 },
        null,
        "row",
        row(4, "Ok", 1),
      ],
    },
  });
  assert.deepEqual(
    board.caught.top.map((r) => r.name),
    ["An", "Ok"],
  );
});

test("names are cut, a species the game does not know is dropped, and only 20 rows are read", () => {
  const long = "x".repeat(100);
  const board = readLeaderboard({
    caught: {
      players: 99,
      top: Array.from({ length: 30 }, (_, i) => row(i + 1, long, 100 - i)),
    },
    heaviest: {
      players: 2,
      top: [
        row(1, "An", 5, { species: "no-such-fish" }),
        row(2, "Bình", 4, { species: "rua-bien" }),
      ],
    },
  });
  assert.equal(board.caught.top.length, BOARD_SIZE);
  assert.equal(board.caught.top[0].name.length, NAME_MAX);
  assert.equal(board.heaviest.top[0].species, undefined);
  assert.equal(board.heaviest.top[1].species, "rua-bien");
});

test("a species is read only on the heaviest board, and `you` only when it is true", () => {
  const board = readLeaderboard({
    caught: { top: [row(1, "An", 3, { species: "rua-bien", you: "yes" })] },
  });
  assert.equal(board.caught.top[0].species, undefined);
  assert.equal(board.caught.top[0].you, false);
  assert.equal(board.caught.players, 1, "players falls back to the rows read");
});

test("the player's own place: in the top, below it, or none", () => {
  const top = [row(1, "An", 9, { you: true })];
  assert.equal(ownPlace({ players: 1, top, me: { rank: 1, value: 9 } }), "top");
  assert.equal(
    ownPlace({
      players: 40,
      top: [row(1, "An", 9)],
      me: { rank: 31, value: 2 },
    }),
    "below",
  );
  assert.equal(ownPlace({ players: 1, top: [row(1, "An", 9)] }), "none");
});

test("values are worded for the screen", () => {
  assert.equal(boardValue("caught", 1234), "1.234 con");
  assert.equal(boardValue("caught", 7.9), "7 con");
  assert.equal(boardValue("heaviest", 12.5), "12,5 kg");
  assert.equal(boardValue("heaviest", 41.25), "41,25 kg");
});

test("the in-memory economy puts the player alone on the boards once they have caught something", async () => {
  let now = 0;
  const money = memoryEconomy({ now: () => now });
  assert.deepEqual(await money.leaderboard(), emptyLeaderboard());
  for (const [species, kg] of [
    ["rua-bien", 25],
    ["tom-hum", 3],
    ["rua-bien", 31.5],
  ]) {
    now += 10_000;
    await money.recordCatch({ species, kg });
  }
  const board = await money.leaderboard();
  assert.deepEqual(board.caught.me, { rank: 1, value: 3 });
  assert.equal(board.caught.top[0].you, true);
  assert.deepEqual(board.heaviest.me, {
    rank: 1,
    value: 31.5,
    species: "rua-bien",
  });
});

test("the migration is read-only and only an account can call it", () => {
  const sql = readFileSync(
    "supabase/migrations/20261121120000_leaderboard.sql",
    "utf8",
  );
  assert.doesNotMatch(
    sql,
    /\b(insert\s+into|update\s+economy|delete\s+from|alter\s+table|drop\s)/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.economy_leaderboard\(\) from public, anon/,
  );
  assert.match(
    sql,
    /grant execute on function public\.economy_leaderboard\(\) to authenticated/,
  );
  assert.match(sql, /limit 20/);
  assert.equal(
    BOARD_SIZE,
    20,
    "the client reads as many rows as the server sends",
  );
});
