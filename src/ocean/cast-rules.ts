/**
 * What a press of the fishing button does, and what a throw looks like before and after it
 * leaves. Pure (no DOM, no Babylon) so a test reads it; src/app/fishing-ui.ts applies it.
 *
 * The button is held to charge a throw and let go to throw it. A press can land in four
 * situations; before this file the one with a landed fish still hanging from the rod only kept
 * the fish and swallowed the press, so the player who tried to throw again, the first thing
 * anyone does after a catch, held a button that did nothing.
 */
export type PressAction =
  /** Not now: the sea is not active, a dialog is open, or the tab is hidden. */
  | "ignore"
  /** A line is out or a fish is on: the press reels or sets the hook (see Angler.pull). */
  | "pull"
  /** Idle with the rod ready: start charging a throw. */
  | "charge"
  /** A landed fish hangs from the rod: keep it AND start charging the next throw. */
  | "keep-and-charge"
  /** A landed fish hangs and the rod is not ready yet: only keep it. */
  | "keep";

export interface PressState {
  /** The sea accepts input (connected, no dialog, tab visible). */
  enabled: boolean;
  /** A landed fish still hangs from the rod. */
  holdingFish: boolean;
  /** The angler is not idle (charging, a line out, a fish on). */
  busy: boolean;
  /** The player's boat and rod exist, so a throw has somewhere to start. */
  hasRod: boolean;
}

export function pressAction(state: PressState): PressAction {
  if (!state.enabled) return "ignore";
  if (state.holdingFish) return state.hasRod ? "keep-and-charge" : "keep";
  if (state.busy) return "pull";
  return state.hasRod ? "charge" : "ignore";
}

/** What the throw preview says: a throw that cannot land on water is "blocked". */
export type CastLook = "blocked" | "sweet" | "open";

export function castLook(target: { water: boolean; sweet: boolean }): CastLook {
  return !target.water ? "blocked" : target.sweet ? "sweet" : "open";
}

/** How long the power bar stays on screen, red, after a throw that could not land (ms). */
export const FIZZLE_MS = 900;
