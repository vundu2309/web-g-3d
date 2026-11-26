import { speciesById } from "./fishing.ts";

/**
 * Daily quests and what a catch reports back (decision 0021), as plain data. The database picks
 * three quests a day for each account (`economy_private.ensure_quests`), counts them inside
 * `record_catch`, and pays a finished one (`economy_quest_claim`); this file is the shape of its
 * answers, the words for a quest, and a copy of the catalogue for the in-memory economy (a test
 * keeps it equal to the migration's `quest_defs`).
 */
export const DAILY_CAP = 120;
export const QUEST_SLOTS = 3;

export interface QuestDef {
  id: string;
  slot: 0 | 1 | 2;
  /** A species the catch must be (absent: any). */
  species?: string;
  /** The catch must weigh at least this many kg (absent: any weight). */
  minKg?: number;
  goal: number;
  reward: number;
}
/** Slot 0 any fish; slot 1 a gentle species; slot 2 something big or rare. */
export const QUEST_DEFS: readonly QuestDef[] = [
  { id: "any-5", slot: 0, goal: 5, reward: 15 },
  { id: "any-8", slot: 0, goal: 8, reward: 20 },
  { id: "any-10", slot: 0, goal: 10, reward: 25 },
  { id: "cua-2", slot: 1, species: "cua-bien", goal: 2, reward: 25 },
  { id: "sao-3", slot: 1, species: "sao-bien", goal: 3, reward: 25 },
  { id: "sua-2", slot: 1, species: "sua", goal: 2, reward: 30 },
  { id: "ca-he-2", slot: 1, species: "ca-he", goal: 2, reward: 35 },
  { id: "ca-ngua-2", slot: 1, species: "ca-ngua", goal: 2, reward: 40 },
  { id: "big-20", slot: 2, minKg: 20, goal: 1, reward: 40 },
  { id: "tom-hum-1", slot: 2, species: "tom-hum", goal: 1, reward: 45 },
  { id: "rua-1", slot: 2, species: "rua-bien", goal: 1, reward: 45 },
  { id: "ca-map-1", slot: 2, species: "ca-map", goal: 1, reward: 50 },
];

export interface Quest {
  slot: 0 | 1 | 2;
  species?: string;
  minKg?: number;
  goal: number;
  progress: number;
  reward: number;
  claimed: boolean;
}
export interface QuestsState {
  /** The Vietnamese day, "YYYY-MM-DD". */
  day: string;
  /** When the quests change (ms, the shared clock's scale). */
  resetsAt: number;
  /** Coins the day's cap still allows. */
  capLeft: number;
  quests: Quest[];
}
/** The progress of one quest, as `record_catch` reports it. */
export interface QuestProgress {
  slot: 0 | 1 | 2;
  progress: number;
  goal: number;
  done: boolean;
}
/** What the server says about a kept fish. Everything but `record` may be missing (older server, or a counting failure). */
export interface CatchResult {
  record: boolean;
  /** The species was met for the first time (the server's own records). */
  discovered: boolean;
  quests?: QuestProgress[];
  /** The hourly event card: the player's best score and giants counted this hour. */
  event?: { score: number; catches: number };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const int = (value: unknown, max: number): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.min(max, Math.floor(value))
    : undefined;
const slotOf = (value: unknown): 0 | 1 | 2 | undefined =>
  value === 0 || value === 1 || value === 2 ? value : undefined;

/** Reads the answer of `economy_quests` defensively: a malformed quest is dropped. */
export function readQuests(raw: unknown): QuestsState {
  const source = isRecord(raw) ? raw : {};
  const quests: Quest[] = [];
  for (const item of Array.isArray(source.quests) ? source.quests : []) {
    if (!isRecord(item)) continue;
    const slot = slotOf(item.slot);
    const goal = int(item.goal, 1000);
    const progress = int(item.progress, 1000);
    const reward = int(item.reward, 1000);
    if (
      slot === undefined ||
      !goal ||
      progress === undefined ||
      reward === undefined
    )
      continue;
    const species =
      typeof item.species === "string" && speciesById(item.species)
        ? item.species
        : undefined;
    const minKg =
      typeof item.minKg === "number" && item.minKg > 0 ? item.minKg : undefined;
    quests.push({
      slot,
      ...(species ? { species } : {}),
      ...(minKg ? { minKg } : {}),
      goal,
      progress: Math.min(progress, goal),
      reward,
      claimed: item.claimed === true,
    });
  }
  quests.sort((a, b) => a.slot - b.slot);
  return {
    day: typeof source.day === "string" ? source.day.slice(0, 10) : "",
    resetsAt: int(source.resetsAt, 8.64e15) ?? 0,
    capLeft: Math.min(DAILY_CAP, int(source.capLeft, DAILY_CAP) ?? 0),
    quests: quests.slice(0, QUEST_SLOTS),
  };
}

/** Reads what `economy_record_catch` returned. Never throws: an odd answer is a plain catch. */
export function readCatchResult(raw: unknown): CatchResult {
  const source = isRecord(raw) ? raw : {};
  const quests: QuestProgress[] = [];
  if (Array.isArray(source.quests))
    for (const item of source.quests.slice(0, QUEST_SLOTS)) {
      if (!isRecord(item)) continue;
      const slot = slotOf(item.slot);
      const progress = int(item.progress, 1000);
      const goal = int(item.goal, 1000);
      if (slot === undefined || progress === undefined || !goal) continue;
      quests.push({ slot, progress, goal, done: item.done === true });
    }
  const event = isRecord(source.event)
    ? {
        score: int(source.event.score, 1_000_000) ?? 0,
        catches: int(source.event.catches, 10) ?? 0,
      }
    : undefined;
  return {
    record: source.record === true,
    discovered: source.discovered === true,
    ...(quests.length ? { quests } : {}),
    ...(event ? { event } : {}),
  };
}

/** Whether a kept fish counts toward a quest (the rule `on_catch` applies). */
export const questMatches = (
  quest: Pick<Quest, "species" | "minKg">,
  species: string,
  kg: number,
) =>
  (quest.species === undefined || quest.species === species) &&
  (quest.minKg === undefined || kg >= quest.minKg);

/** A finished quest that has not been claimed. */
export const questReady = (quest: Quest) =>
  !quest.claimed && quest.progress >= quest.goal;
/** How many quests wait to be claimed (the dot on the book's tab). */
export const questsReady = (state: QuestsState | undefined) =>
  state ? state.quests.filter(questReady).length : 0;

/** The quest in words ("Câu 5 con cá bất kỳ"). */
export function questText(quest: Pick<Quest, "species" | "minKg" | "goal">) {
  const name = quest.species ? speciesById(quest.species)?.name : undefined;
  if (quest.minKg !== undefined)
    return quest.goal === 1
      ? `Câu một con nặng từ ${quest.minKg} kg`
      : `Câu ${quest.goal} con nặng từ ${quest.minKg} kg`;
  if (name) return `Câu ${quest.goal} con ${name}`;
  return `Câu ${quest.goal} con cá bất kỳ`;
}

/** Three quests for an account on a day, chosen by a hash (the same all day, different between players). */
export function pickQuests(seed: string, dayKey: number): QuestDef[] {
  const hash = (text: string) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++)
      h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
    return h;
  };
  return [0, 1, 2].map((slot) => {
    const pool = QUEST_DEFS.filter((d) => d.slot === slot);
    return pool
      .map((d) => ({ d, k: hash(`${seed}|${dayKey}|${d.id}`) }))
      .sort((a, b) => a.k - b.k || (a.d.id < b.d.id ? -1 : 1))[0]!.d;
  });
}
