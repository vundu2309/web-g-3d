import type { WeatherKind } from "./atmosphere.ts";
import {
  habitatOf,
  type Band,
  type Habitat,
  type Sea,
} from "./fishing-conditions.ts";
import { SPECIES, type Inventory, type Zone } from "./fishing.ts";
import { HOT_SLOT_MS, type HotSpot } from "./hot-spots.ts";
import { timeLeftText } from "./game-clock.ts";

/**
 * What the "Sổ cá" page shows, as plain data (no DOM, so tests read it): the species the player
 * has met, with their best weight, and where and when to find each; and a line about the sea
 * right now. Everything the words say comes from the tables the odds use (fishing-conditions.ts),
 * so the page cannot say one thing while the bites do another.
 *
 * A species is "found" when the player has ever kept a fish of it (its record weight is above 0, which
 * survives selling and putting back); it is NOT the record flag of a catch, which is also set on the
 * first catch of every species.
 */
export const ZONE_NAMES: Readonly<Record<Zone, string>> = {
  shore: "gần bờ",
  open: "biển mở",
  deep: "biển sâu",
};
export const BAND_NAMES: Readonly<Record<Band, string>> = {
  night: "ban đêm",
  twilight: "lúc chạng vạng",
  day: "ban ngày",
};
export const WEATHER_NAMES: Readonly<Record<WeatherKind, string>> = {
  clear: "trời quang",
  overcast: "trời âm u",
  rain: "khi mưa",
  fog: "khi có sương",
};

export interface BookEntry {
  id: string;
  name: string;
  rarity: 1 | 2 | 3;
  state: "found" | "unknown";
  /** Heaviest fish of the species the player has kept, kg (0 when not found). */
  bestKg: number;
  /** How many of them the store holds now. */
  held: number;
  habitat: Habitat;
  /** "Gần bờ · ban đêm · khi mưa". */
  where: string;
}

/** The words for where and when a species is found. */
export function whereText(habitat: Habitat): string {
  const parts = [
    habitat.zones.map((z) => ZONE_NAMES[z]).join(", "),
    ...habitat.bands.map((b) => BAND_NAMES[b]),
    ...habitat.weathers.map((w) => WEATHER_NAMES[w]),
  ].filter(Boolean);
  const text = parts.join(" · ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The ten species in the order of the page: by how rare, then by name. */
export function collectionView(inventory: Inventory): BookEntry[] {
  return [...SPECIES]
    .sort((a, b) => a.rarity - b.rarity || a.name.localeCompare(b.name, "vi"))
    .map((species) => {
      const stock = inventory[species.id];
      const habitat = habitatOf(species.id);
      const best = stock?.best ?? 0;
      return {
        id: species.id,
        name: species.name,
        rarity: species.rarity,
        state: best > 0 ? ("found" as const) : ("unknown" as const),
        bestKg: best,
        held: stock?.n ?? 0,
        habitat,
        where: whereText(habitat),
      };
    });
}

/** How many of the species are found. */
export const collectionProgress = (entries: readonly BookEntry[]) => ({
  found: entries.filter((e) => e.state === "found").length,
  total: entries.length,
});

const nameOf = (id: string) => SPECIES.find((s) => s.id === id)?.name ?? id;

/** The line about the sea right now ("Biển bây giờ"). */
export function seaText(sea: Sea): {
  title: string;
  easy: string;
  pace: string;
} {
  const weather =
    sea.weather === "clear"
      ? "Trời quang"
      : sea.weather === "overcast"
        ? "Trời âm u"
        : sea.weather === "rain"
          ? "Mưa"
          : "Sương mù";
  const band =
    sea.band === "twilight"
      ? "Chạng vạng"
      : sea.band === "night"
        ? "Ban đêm"
        : "Ban ngày";
  const easy = sea.easy.length
    ? `Dễ gặp: ${sea.easy.slice(0, 4).map(nameOf).join(", ")}`
    : "Không loài nào dễ gặp hơn thường lệ";
  const pace =
    sea.biteChance >= 0.85 && sea.waitScale <= 1.05
      ? "Cá cắn câu nhanh"
      : sea.waitScale >= 1.1
        ? "Cá cắn câu chậm"
        : sea.biteChance >= 0.85
          ? "Cá hay cắn câu"
          : "Cá cắn câu như thường";
  return { title: `${band} · ${weather}`, easy, pace };
}

/** A hot spot as a line: "Cá mập · quanh Hải Đăng · còn 9 phút". */
export function hotSpotText(spot: HotSpot, worldMs: number): string {
  const left = Math.min(HOT_SLOT_MS, Math.max(0, spot.endsAtMs - worldMs));
  return `${nameOf(spot.species)} · ${spot.label} · ${timeLeftText(left)}`;
}
