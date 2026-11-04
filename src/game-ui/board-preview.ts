/**
 * Local preview fixture: maps HUD presentation to board state. Not authoritative game data.
 * Tokens and houses are illustrative and only drive the 3D board in ?view=game.
 */
import type { BoardState } from "../board/scene";
import type { Presentation } from "./render";

/** Illustrative positions: Minh's token travels from St. James Place (16) to Illinois (24) in state 2. */
const PREVIEW_HOUSE_SPACES = [21, 23, 24] as const;

export function previewBoardState(p: Presentation): BoardState {
  const s = p.scenario;
  const minhSpace = s.id === 1 || s.id === 20 ? 16 : 24;
  return {
    tokens: [
      { player: 0, space: minhSpace },
      { player: 1, space: 13 },
      { player: 2, space: 32 },
      { player: 3, space: 8 },
    ],
    buildings: [
      { space: 8, level: 3 },
      { space: 39, level: 5 },
      { space: 31, level: 2 },
      ...PREVIEW_HOUSE_SPACES.map((space, i) => ({
        space,
        level: p.houses[i] ?? 0,
      })),
    ],
    focus: s.active,
    sidePanel: s.surface !== "none" || s.actions.length > 0,
  };
}
