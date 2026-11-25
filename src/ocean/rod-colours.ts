import { PAL } from "./art/colors.ts";
import type { RodColour } from "./rod-plan.ts";

/**
 * The palette role of every colour name of a rod plan (rod-plan.ts), as a PAL number: the one table
 * the drawn rod (rod-visual.ts) and the rod's picture in the market (rod-geometry.ts) both read, so
 * the picture is the rod. Only the bamboo rod's thread wrap is the boat's own trim colour, which
 * the caller gives (`wrap`).
 */
export function rodColour(name: RodColour, wrap: number): number {
  switch (name) {
    case "cap":
      return PAL.rod.cap;
    case "cork":
      return PAL.rod.cork;
    case "steel":
      return PAL.metal.light;
    case "dark":
      return PAL.metal.steel;
    case "tip":
      return PAL.rod.tip;
    case "culm":
      return PAL.wood.trim;
    case "node":
      return PAL.wood.deep;
    case "wrap":
      return wrap;
    case "glass":
      return PAL.paint.white;
    case "glassBand":
      return PAL.people.clothes.jeans;
    case "foam":
      return PAL.paint.green;
    case "carbonA":
      return PAL.people.hair.black;
    case "carbonB":
      return PAL.metal.steel;
    case "carbonWrap":
      return PAL.paint.red;
    case "grip":
      return PAL.people.hair.black;
    case "gold":
      return PAL.market.coin;
    case "goldPale":
      return PAL.paint.creamWarm;
    case "gem":
      return PAL.rod.reel;
    case "rosewood":
      return PAL.wood.deep;
    case "pearl":
      return PAL.paint.white;
    case "reel":
      return PAL.rod.reel;
    case "accent":
      return PAL.rod.accent;
  }
}
