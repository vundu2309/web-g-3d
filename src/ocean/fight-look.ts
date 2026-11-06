import type { FightView } from "./fight.ts";

/**
 * How a fight looks, as plain numbers: the line goes white, then yellow, then red as the
 * tension climbs and starts to tremble, and the fish moves by mood. No Babylon in here so
 * it is tested directly; fishing-gear.ts only applies the numbers.
 */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const clamp = (value: number, low = 0, high = 1) =>
  Math.min(high, Math.max(low, value));

const WHITE: Rgb = { r: 1, g: 1, b: 1 };
const YELLOW: Rgb = { r: 1, g: 0.85, b: 0.25 };
const RED: Rgb = { r: 1, g: 0.2, b: 0.15 };
const mix = (a: Rgb, b: Rgb, t: number): Rgb => ({
  r: a.r + (b.r - a.r) * t,
  g: a.g + (b.g - a.g) * t,
  b: a.b + (b.b - a.b) * t,
});

/** White while slack, yellow when taut, red close to snapping. */
export function lineColour(tension: number): Rgb {
  const t = clamp(tension);
  return t < 0.55
    ? mix(WHITE, YELLOW, clamp(t / 0.55))
    : mix(YELLOW, RED, clamp((t - 0.55) / 0.35));
}

/** Sideways tremble of the line (m): none when slack, a hum when taut, a shake near the snap. */
export function lineTremble(tension: number): number {
  const t = clamp((tension - 0.3) / 0.7);
  return 0.03 + 0.2 * t * t;
}

/** How much the line sags (m): slack when the fish is tired, straight when it pulls. */
export function lineSag(tension: number): number {
  return 1.7 * (1 - clamp(tension / 0.5)) + 0.05;
}

export interface FishPose {
  /** Distance from the boat along the line (m). */
  distance: number;
  /** Sideways swing of the body (m). */
  swing: number;
  /** Heading wobble (rad). */
  yaw: number;
  /** Roll about the long axis (rad): on its side when tired. */
  roll: number;
  /** Tail beats per second. */
  beat: number;
  /** Rise out of the water (m), above the water line. */
  lift: number;
  /** Splash strength 0..1. */
  splash: number;
}

/** Where the hooked fish is and how it moves in each mood. */
export function fishPose(fight: FightView, time: number): FishPose {
  const t = time;
  if (fight.mood === "surge")
    return {
      distance: fight.distance,
      swing: Math.sin(t * 8) * 2.4,
      yaw: Math.sin(t * 13) * 0.55,
      roll: Math.sin(t * 11) * 0.5,
      beat: 9,
      lift: 0.25 + 0.2 * Math.abs(Math.sin(t * 6)),
      splash: 1,
    };
  if (fight.mood === "tired")
    return {
      distance: fight.distance,
      swing: Math.sin(t * 1.1) * 0.25,
      yaw: Math.sin(t * 0.9) * 0.12,
      roll: 0.9,
      beat: 1.2,
      lift: 0,
      splash: 0,
    };
  return {
    distance: fight.distance,
    swing: Math.sin(t * 2.6) * 1.2,
    yaw: Math.sin(t * 4) * 0.3,
    roll: Math.sin(t * 2.4) * 0.2,
    beat: 4,
    lift: 0,
    splash: fight.reeling ? 0.35 : 0,
  };
}

/** Fish length in the scene (m) from how heavy it is for its kind (0 lightest .. 1 heaviest). */
export const fishLength = (weight: number) =>
  1.7 + 1.5 * Math.min(1, Math.max(0, weight));
