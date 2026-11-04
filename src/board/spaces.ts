/**
 * Canonical 40-space order from docs/game/rules/board-and-properties.md (US-BOARD-001).
 * Index 0 is GO; indices increase in the direction of movement. Names stay in English.
 * Pure data: no three.js or DOM imports.
 */
export type SpaceKind =
  | "corner"
  | "property"
  | "railroad"
  | "utility"
  | "card"
  | "tax";
export type ColorGroup =
  | "brown"
  | "lightblue"
  | "pink"
  | "orange"
  | "red"
  | "yellow"
  | "green"
  | "darkblue";
export type CardDeck = "chance" | "chest";
export interface BoardSpace {
  readonly index: number;
  readonly name: string;
  readonly kind: SpaceKind;
  readonly group?: ColorGroup;
  readonly deck?: CardDeck;
}

/** Stripe colours for the inner band of each colour-group space. */
export const GROUP_COLORS: Readonly<Record<ColorGroup, string>> = {
  brown: "#935738",
  lightblue: "#aee1f4",
  pink: "#df56a5",
  orange: "#f29b29",
  red: "#ed3241",
  yellow: "#f5d333",
  green: "#3bb867",
  darkblue: "#2875ce",
};

const P = (index: number, name: string, group: ColorGroup): BoardSpace => ({
  index,
  name,
  kind: "property",
  group,
});
const corner = (index: number, name: string): BoardSpace => ({
  index,
  name,
  kind: "corner",
});

export const BOARD_SPACES: readonly BoardSpace[] = [
  corner(0, "GO"),
  P(1, "Mediterranean Avenue", "brown"),
  { index: 2, name: "Community Chest", kind: "card", deck: "chest" },
  P(3, "Baltic Avenue", "brown"),
  { index: 4, name: "Income Tax", kind: "tax" },
  { index: 5, name: "Reading Railroad", kind: "railroad" },
  P(6, "Rhode Island Avenue", "lightblue"),
  { index: 7, name: "Chance", kind: "card", deck: "chance" },
  P(8, "Vermont Avenue", "lightblue"),
  P(9, "Connecticut Avenue", "lightblue"),
  corner(10, "Jail / Just Visiting"),
  P(11, "St. Charles Place", "pink"),
  { index: 12, name: "Electric Company", kind: "utility" },
  P(13, "States Avenue", "pink"),
  P(14, "Virginia Avenue", "pink"),
  { index: 15, name: "Pennsylvania Railroad", kind: "railroad" },
  P(16, "St. James Place", "orange"),
  { index: 17, name: "Community Chest", kind: "card", deck: "chest" },
  P(18, "Tennessee Avenue", "orange"),
  P(19, "New York Avenue", "orange"),
  corner(20, "Free Parking"),
  P(21, "Kentucky Avenue", "red"),
  { index: 22, name: "Chance", kind: "card", deck: "chance" },
  P(23, "Indiana Avenue", "red"),
  P(24, "Illinois Avenue", "red"),
  { index: 25, name: "B. & O. Railroad", kind: "railroad" },
  P(26, "Atlantic Avenue", "yellow"),
  P(27, "Ventnor Avenue", "yellow"),
  { index: 28, name: "Water Works", kind: "utility" },
  P(29, "Marvin Gardens", "yellow"),
  corner(30, "Go To Jail"),
  P(31, "Pacific Avenue", "green"),
  P(32, "North Carolina Avenue", "green"),
  { index: 33, name: "Community Chest", kind: "card", deck: "chest" },
  P(34, "Pennsylvania Avenue", "green"),
  { index: 35, name: "Short Line", kind: "railroad" },
  { index: 36, name: "Chance", kind: "card", deck: "chance" },
  P(37, "Park Place", "darkblue"),
  { index: 38, name: "Luxury Tax", kind: "tax" },
  P(39, "Boardwalk", "darkblue"),
];

export const SPACE_COUNT = 40;

export function spaceAt(index: number): BoardSpace {
  const wrapped = ((index % SPACE_COUNT) + SPACE_COUNT) % SPACE_COUNT;
  return BOARD_SPACES[wrapped]!;
}
