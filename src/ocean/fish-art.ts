import type { Shape, Species } from "./fishing";

/**
 * One drawing per species, as inline SVG in the game's outlined style. The body
 * colour and the fin colour come from the species table, the outline is the theme ink.
 * Only table data goes in, never player text.
 */
const INK = "#153b80";

interface Parts {
  body: string;
  tail: string;
  fins: string[];
  eye: [number, number];
  /** Extra detail on top of the body (stripes, spots, bill). */
  detail?: string;
}

const SHAPES: Record<Shape, Parts> = {
  slim: {
    body: "M6 40C26 27 70 27 100 38L100 42C70 53 26 53 6 40Z",
    tail: "M98 40L128 22L123 40L128 58Z",
    fins: ["M52 29L62 20L70 30Z", "M58 51L66 59L72 50Z"],
    eye: [22, 38],
  },
  round: {
    body: "M10 40C14 12 78 8 104 34L104 46C78 72 14 68 10 40Z",
    tail: "M102 40L130 18L124 40L130 62Z",
    fins: ["M44 16L62 6L76 18Z", "M50 64L66 74L78 62Z"],
    eye: [26, 34],
  },
  diamond: {
    body: "M8 40C30 6 70 6 96 40C70 74 30 74 8 40Z",
    tail: "M94 40L126 20L120 40L126 60Z",
    fins: ["M40 14L56 4L66 12Z", "M42 66L58 76L68 68Z"],
    eye: [26, 36],
  },
  puffer: {
    body: "M10 40C10 14 40 6 66 6C96 6 112 22 112 40C112 58 96 74 66 74C40 74 10 66 10 40Z",
    tail: "M110 40L130 28L128 40L130 52Z",
    fins: ["M56 68L68 78L78 68Z"],
    eye: [30, 30],
    detail:
      "M44 20L48 12M60 14L62 6M76 16L80 8M92 26L98 20M50 62L46 70M70 66L72 74M88 60L94 66",
  },
  chunky: {
    body: "M8 44C8 14 60 8 100 30L100 52C60 76 8 72 8 44Z",
    tail: "M98 40L130 14L124 40L130 66Z",
    fins: ["M34 14L50 4L56 12L66 6L74 16L74 22Z", "M52 66L66 76L76 64Z"],
    eye: [24, 36],
    detail: "M44 26C40 40 44 56 52 66",
  },
  torpedo: {
    body: "M6 40C30 18 84 18 112 36L112 44C84 62 30 62 6 40Z",
    tail: "M110 40L136 18L130 40L136 62Z",
    fins: ["M56 22L72 8L80 24Z", "M58 56L70 68L80 56Z"],
    eye: [22, 37],
    detail: "M44 26L52 52M60 24L68 52M76 24L84 50",
  },
  flat: {
    body: "M70 8L132 40L70 72L8 40Z",
    tail: "M132 40L142 40",
    fins: [],
    eye: [44, 32],
    detail: "M44 48C56 54 66 54 76 50",
  },
  sword: {
    body: "M30 38C48 22 90 22 112 36L112 44C90 58 48 58 30 42Z",
    tail: "M110 40L136 16L130 40L136 64Z",
    fins: ["M64 24L84 4L90 26Z", "M64 54L76 66L88 54Z"],
    eye: [46, 36],
    detail: "M2 40L32 40",
  },
};

export function fishSvg(species: Species, size = 96): string {
  const shape = SHAPES[species.shape];
  const stroke = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
  const fins = shape.fins
    .map((d) => `<path d="${d}" fill="${species.fin}" ${stroke}/>`)
    .join("");
  const detail = shape.detail
    ? `<path d="${shape.detail}" fill="none" ${stroke} ${species.shape === "sword" ? 'stroke-width="5"' : ""}/>`
    : "";
  const tail =
    species.shape === "flat"
      ? `<path d="${shape.tail}" fill="none" ${stroke} stroke-width="5"/>`
      : `<path d="${shape.tail}" fill="${species.fin}" ${stroke}/>`;
  return `<svg class="fish-art" viewBox="0 0 144 80" width="${size}" height="${(size * 80) / 144}" aria-hidden="true" focusable="false">${tail}${fins}<path d="${shape.body}" fill="${species.body}" ${stroke}/><path d="${shape.body}" fill="#fff" opacity=".28" transform="translate(0 9) scale(1 .45)" transform-origin="60 40" stroke="none"/>${detail}<circle cx="${shape.eye[0]}" cy="${shape.eye[1]}" r="3.6" fill="${INK}"/></svg>`;
}
