/**
 * Switches for finding what costs frames, for the developer: `?reflect=0`, `?fish=0`, `?props=0`,
 * `?tiers=0`, `?yards=0`, `?scale=1` in the page address (tests and the render harness use them).
 * The player has none of them: every part of the graphics is on and Settings has no switch for it
 * (2026-11-20, the user's decision), so nothing a device stored earlier can leave a part out: only
 * `waves` (the "Thử sóng biển" card) is still read from the device.
 */
const KEY = "sea-probe";
/** The only switch read from what the device stored; the others come from the page address alone. */
const STORED = new Set(["waves"]);
export const PROBES = [
  // `feature` true: the switch shows whether the part is on (the game's normal state) and setting it
  // off leaves the part out. `feature` false: the switch is a forced setting, on only when forced.
  { name: "reflect", off: "0", label: "Phản chiếu nước", feature: true },
  { name: "fish", off: "0", label: "Đàn cá", feature: true },
  { name: "props", off: "0", label: "Dừa, bụi, nhà, đá", feature: true },
  {
    name: "tiers",
    off: "0",
    label: "Thuyền lớn (mô hình bậc cao)",
    feature: true,
  },
  {
    name: "cats",
    off: "0",
    label: "Mèo chèo thuyền (NPC)",
    feature: true,
  },
  {
    name: "planes",
    off: "0",
    label: "Thủy phi cơ kéo băng rôn (NPC)",
    feature: true,
  },
  { name: "yards", off: "0", label: "Xưởng tàu (ba bến)", feature: true },
  { name: "scale", off: "1", label: "Ép độ phân giải 1x", feature: false },
] as const;

const stored = (): Record<string, string> => {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(KEY) ?? "{}",
    );
    if (!parsed || typeof parsed !== "object") return {};
    const kept: Record<string, string> = {};
    for (const [name, value] of Object.entries(parsed))
      if (STORED.has(name) && typeof value === "string") kept[name] = value;
    return kept;
  } catch {
    return {};
  }
};

export const probe = (name: string): string | null => {
  try {
    const fromAddress = new URLSearchParams(window.location.search).get(name);
    if (fromAddress !== null) return fromAddress;
  } catch {
    /* no window: nothing set */
  }
  return stored()[name] ?? null;
};

export const setProbe = (name: string, value: string | null) => {
  try {
    const all = stored();
    if (value === null) delete all[name];
    else all[name] = value;
    if (Object.keys(all).length)
      window.localStorage.setItem(KEY, JSON.stringify(all));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* blocked storage: the switch just is not remembered */
  }
};

/** The switches that are set now, as short words for the performance panel ("reflect", "fish", "scale=1"…). */
export const probeSummary = (): string[] => {
  const words = PROBES.filter((item) => probe(item.name) === item.off).map(
    (item) => (item.feature ? item.name : `${item.name}=${item.off}`),
  );
  // The taller sea (waves.ts) changes what a frame costs too, so it is named beside the others.
  const waves = Number(probe("waves"));
  if (Number.isFinite(waves) && waves > 1) words.push(`waves=${waves}`);
  return words;
};

/** The sea's heights the "Thử sóng biển" card of Settings offers (1 is the usual sea). */
export const WAVE_CHOICES = [1, 2, 3, 4] as const;
