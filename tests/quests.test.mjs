import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { EconomyError, memoryEconomy } from "../src/ocean/economy-api.ts";
import {
  GIANT_SPECIES,
  giantFloor,
  readEventBoard,
} from "../src/ocean/event-board.ts";
import { SPECIES } from "../src/ocean/fishing.ts";
import { vnDateString, vnDayKey } from "../src/ocean/game-clock.ts";
import { readWeeklyBoard } from "../src/ocean/leaderboard.ts";
import {
  DAILY_CAP,
  QUEST_DEFS,
  pickQuests,
  questMatches,
  questReady,
  questText,
  questsReady,
  readCatchResult,
  readQuests,
} from "../src/ocean/quests.ts";
import { giantWeights } from "../src/ocean/world-event.ts";

const sql = readFileSync(
  new URL(
    "../supabase/migrations/20261128120000_progression.sql",
    import.meta.url,
  ),
  "utf8",
);

test("the quest catalogue is the migration's quest_defs, row for row", () => {
  const rows = [
    ...sql.matchAll(
      /\('([a-z0-9-]+)',\s+(\d),\s+(null|'[a-z-]+'),\s+(null|\d+),\s+(\d+),\s+(\d+)\)/g,
    ),
  ].map(([, id, slot, species, minKg, goal, reward]) => ({
    id,
    slot: Number(slot),
    ...(species !== "null" ? { species: species.slice(1, -1) } : {}),
    ...(minKg !== "null" ? { minKg: Number(minKg) } : {}),
    goal: Number(goal),
    reward: Number(reward),
  }));
  assert.equal(rows.length, QUEST_DEFS.length);
  assert.deepEqual(rows, QUEST_DEFS);
  for (const d of QUEST_DEFS)
    if (d.species)
      assert.ok(
        SPECIES.some((s) => s.id === d.species),
        d.species,
      );
  assert.ok(sql.includes(`120 - taken`), "the migration's daily cap");
  assert.equal(DAILY_CAP, 120);
});

test("the three dearest quests stay under the day's cap, and every slot has choices", () => {
  const best = [0, 1, 2].map((slot) =>
    Math.max(...QUEST_DEFS.filter((d) => d.slot === slot).map((d) => d.reward)),
  );
  assert.ok(best.reduce((a, b) => a + b) <= DAILY_CAP, `best ${best}`);
  for (const slot of [0, 1, 2])
    assert.ok(QUEST_DEFS.filter((d) => d.slot === slot).length >= 3);
});

test("the event's giants are the migration's three species, and the client's own giant list", () => {
  const listed = sql
    .match(/p_species in \(([^)]*)\)/)[1]
    .match(/'([a-z-]+)'/g)
    .map((t) => t.slice(1, -1));
  assert.deepEqual(listed, [...GIANT_SPECIES]);
  const rolled = Object.entries(giantWeights())
    .filter(([, w]) => w > 0)
    .map(([id]) => id);
  assert.deepEqual(rolled.sort(), [...GIANT_SPECIES].sort());
  assert.ok(sql.includes("0.87 * (f.max_kg - f.min_kg)"));
  // The client rolls the top 12 %: every rolled giant clears the server's floor.
  for (const id of GIANT_SPECIES) {
    const s = SPECIES.find((x) => x.id === id);
    assert.ok(s.kg[0] + 0.88 * (s.kg[1] - s.kg[0]) >= giantFloor(id));
  }
  assert.equal(giantFloor("cua-bien"), Infinity);
});

test("a quest is picked per account and day, the same all day", () => {
  const a = pickQuests("alice", 20600);
  assert.deepEqual(a, pickQuests("alice", 20600));
  assert.deepEqual(
    a.map((q) => q.slot),
    [0, 1, 2],
  );
  const ids = new Set();
  let differs = 0;
  for (let d = 20600; d < 20640; d++) {
    for (const q of pickQuests("alice", d)) ids.add(q.id);
    if (pickQuests("alice", d)[1].id !== pickQuests("bob", d)[1].id) differs++;
  }
  assert.ok(ids.size >= 7, `variety ${ids.size}`);
  assert.ok(differs >= 10, "two accounts get different quests");
});

test("the words and the matching rule of a quest", () => {
  assert.equal(questText({ goal: 5 }), "Câu 5 con cá bất kỳ");
  assert.equal(
    questText({ goal: 2, species: "cua-bien" }),
    "Câu 2 con Cua biển",
  );
  assert.equal(questText({ goal: 1, minKg: 20 }), "Câu một con nặng từ 20 kg");
  assert.ok(questMatches({}, "ca-he", 0.1));
  assert.ok(questMatches({ species: "ca-he" }, "ca-he", 0.1));
  assert.ok(!questMatches({ species: "ca-he" }, "sua", 1));
  assert.ok(questMatches({ minKg: 20 }, "ca-heo", 20));
  assert.ok(!questMatches({ minKg: 20 }, "ca-heo", 19.99));
});

test("readQuests and readCatchResult survive malformed answers", () => {
  assert.deepEqual(readQuests(null).quests, []);
  assert.deepEqual(readQuests("x").quests, []);
  const state = readQuests({
    day: "2026-11-26",
    resetsAt: 1795000000000,
    capLeft: 500,
    quests: [
      {
        slot: 1,
        species: "cua-bien",
        goal: 2,
        progress: 9,
        reward: 25,
        claimed: false,
      },
      { slot: 0, goal: 5, progress: 5, reward: 15, claimed: true },
      { slot: 5, goal: 1, progress: 0, reward: 1 },
      { slot: 2, goal: 0, progress: 0, reward: 1 },
      {
        slot: 2,
        species: "no-such",
        goal: 1,
        progress: 0,
        reward: 40,
        minKg: -3,
      },
      "junk",
    ],
  });
  assert.deepEqual(
    state.quests.map((q) => q.slot),
    [0, 1, 2],
  );
  assert.equal(state.capLeft, DAILY_CAP, "the cap is clamped");
  assert.equal(state.quests[1].progress, 2, "progress never passes the goal");
  assert.equal(
    state.quests[2].species,
    undefined,
    "an unknown species is dropped",
  );
  assert.equal(state.quests[2].minKg, undefined);
  assert.equal(questsReady(state), 1);
  assert.ok(!questReady(state.quests[0]), "a claimed quest is not ready");

  assert.deepEqual(readCatchResult(undefined), {
    record: false,
    discovered: false,
  });
  const result = readCatchResult({
    id: 4,
    record: true,
    discovered: true,
    quests: [{ slot: 0, progress: 2, goal: 5, done: false }, { slot: 9 }],
    event: { score: 400, catches: 2 },
  });
  assert.equal(result.quests.length, 1);
  assert.deepEqual(result.event, { score: 400, catches: 2 });
  assert.deepEqual(readCatchResult({ record: true }), {
    record: true,
    discovered: false,
  });
});

test("the event board and the weekly board are read defensively", () => {
  const board = readEventBoard({
    slot: 498800,
    active: true,
    startsAt: 1,
    endsAt: 2,
    players: 2,
    top: [
      {
        rank: 1,
        name: "  Bob ",
        species: "ca-map",
        kg: 300,
        score: 900,
        you: false,
      },
      { rank: 2, name: "X", species: "no-such", kg: 1, score: 1 },
      { rank: 0, name: "Y", species: "ca-heo", kg: 1, score: 1 },
    ],
    me: { rank: 1, species: "ca-map", kg: 300, score: 900 },
  });
  assert.equal(board.top.length, 1);
  assert.equal(board.top[0].name, "Bob");
  assert.equal(board.me.rank, 1);
  assert.deepEqual(readEventBoard(null).top, []);
  const week = readWeeklyBoard({
    week: "2026-11-23",
    endsAt: 5,
    caught: { players: 0, top: [] },
  });
  assert.equal(week.week, "2026-11-23");
  assert.equal(week.endsAt, 5);
  assert.equal(readWeeklyBoard(undefined).week, "");
});

test("the in-memory economy counts quests, pays a claim once, keeps the cap, and keeps weekly and event numbers", async () => {
  let t = Date.parse("2026-11-26T10:05:00Z");
  const money = memoryEconomy({ now: () => t });
  const first = await money.quests();
  assert.equal(first.quests.length, 3);
  assert.equal(first.day, vnDateString(vnDayKey(t)));
  assert.equal(first.capLeft, DAILY_CAP);
  assert.ok(first.resetsAt > t && first.resetsAt - t <= 86_400_000);
  await assert.rejects(
    money.claimQuest(0),
    (e) => e instanceof EconomyError && e.failure === "quest",
  );
  await assert.rejects(
    money.claimQuest(9),
    (e) => e instanceof EconomyError && e.failure === "quest",
  );

  // Catch whatever the quests ask for until every one is done.
  const catchOf = async (species, kg) => {
    t += 10_000;
    return money.recordCatch({ species, kg });
  };
  const first_result = await catchOf("cua-bien", 1);
  assert.equal(first_result.discovered, true);
  assert.equal((await catchOf("cua-bien", 1.1)).discovered, false);
  for (let i = 0; i < 12; i++) await catchOf("cua-bien", 1);
  let state = await money.quests();
  const any = state.quests.find((q) => q.slot === 0);
  assert.ok(questReady(any), "the any-fish quest is done");
  const before = (await money.state()).coins;
  const paid = await money.claimQuest(0);
  assert.equal(paid.earned, any.reward);
  assert.equal(paid.coins, before + any.reward);
  await assert.rejects(money.claimQuest(0), (e) => e.failure === "quest");

  // The day's cap itself is the database's rule (tests/economy-postgres.sql); here it only counts down.
  state = await money.quests();
  assert.equal(state.capLeft, DAILY_CAP - any.reward);

  // Weekly and event numbers.
  const week = await money.weeklyBoard();
  assert.equal(week.caught.me.value, 14);
  const hour = Math.floor(t / 3_600_000) + 1; // the next hour: time only moves forward
  assert.equal((await money.eventBoard()).players, 0);
  t = hour * 3_600_000 + 5 * 60_000;
  const giant = await money.recordCatch({ species: "ca-map", kg: 399 }, hour);
  assert.deepEqual(giant.event, { score: giant.event.score, catches: 1 });
  const light = await (async () => {
    t += 10_000;
    return money.recordCatch({ species: "ca-map", kg: 100 }, hour);
  })();
  assert.equal(light.event, undefined, "a light fish is no giant");
  const board = await money.eventBoard();
  assert.equal(board.players, 1);
  assert.equal(board.top[0].species, "ca-map");
  assert.ok(board.active);
  await assert.rejects(
    money.eventBoard(hour + 1),
    (e) => e instanceof EconomyError,
  );
  await assert.rejects(
    money.eventBoard(hour - 73),
    (e) => e instanceof EconomyError,
  );
});
