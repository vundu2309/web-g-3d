/**
 * The picture behind the hub, the sign-in and the loading screen: a sunset over layered
 * waves with the player's kind of boat. Drawn as SVG, no image file. It is deliberately
 * not the 3D map (no islands, no lighthouse): the map shows only once it is loaded.
 */
const W = 844;
const H = 390;
const INK = "#153b80";

/** A wave whose pattern repeats every `period` px, so it can drift sideways without a seam. */
function wavePath(
  y: number,
  amp: number,
  period: number,
  phase: number,
  fill: string,
  className: string,
) {
  let d = `M${-period} ${H}L${-period} ${y}`;
  for (let x = -period; x <= W + period; x += 6) {
    const a = (x / period) * Math.PI * 2 + phase;
    d += `L${x} ${(y + amp * Math.sin(a) + amp * 0.35 * Math.sin(a * 2 + 1)).toFixed(1)}`;
  }
  d += `L${W + period} ${H}Z`;
  return `<g class="wave ${className}" style="--period:${period}px"><path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/></g>`;
}

const cloud = (x: number, y: number, scale: number, fill: string) =>
  `<g transform="translate(${x} ${y}) scale(${scale})" fill="${fill}"><ellipse cx="46" cy="38" rx="42" ry="16"/><ellipse cx="86" cy="26" rx="34" ry="20"/><ellipse cx="112" cy="40" rx="34" ry="14"/></g>`;

/** The fishing boat of the game: blue hull, cream deck, grey cabin with a coral roof, a rod to starboard. */
const BOAT = `<g class="boat"><path d="M122 12l46-10" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M168 2v26" stroke="#fff" stroke-width="2.5"/><path d="M84 -10V30" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M84 -10l24 6-24 6Z" fill="#ffd35a" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/><path d="M2 42h150l-24 36H28Z" fill="#2a73b8" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/><path d="M2 42h150" stroke="#fff6e0" stroke-width="9" stroke-linecap="round"/><rect x="108" y="22" width="30" height="18" rx="3" fill="#d9a066" stroke="${INK}" stroke-width="4"/><rect x="58" y="12" width="52" height="30" rx="4" fill="#cfd8dc" stroke="${INK}" stroke-width="5"/><rect x="66" y="20" width="36" height="12" rx="3" fill="#8fd0f2" stroke="${INK}" stroke-width="3"/><path d="M52 12h64l-4-12H56Z" fill="#e97760" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/></g>`;

export function hubArt(options: { boat?: boolean } = {}) {
  const boat = options.boat
    ? `<g transform="translate(305 142) scale(1.25)">${BOAT}</g>`
    : "";
  return `<svg class="hub-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false"><defs><linearGradient id="hub-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4b3a8f"/><stop offset=".45" stop-color="#e0597a"/><stop offset=".78" stop-color="#ffb35a"/><stop offset="1" stop-color="#ffe29a"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#hub-sky)"/><circle class="sun-glow" cx="560" cy="226" r="108" fill="#ffd35a" opacity=".28"/><circle cx="560" cy="226" r="74" fill="#ffd35a" stroke="${INK}" stroke-width="4"/>${cloud(60, 86, 0.8, "#ffb3b8")}${cloud(300, 150, 0.6, "#ffc9a8")}${cloud(640, 70, 0.7, "#ff9aa8")}<g class="birds" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"><path d="M250 92q8-10 16 0q8-10 16 0"/><path d="M290 114q6-8 12 0q6-8 12 0"/></g>${wavePath(232, 5, 260, 0, "#ff8a6a", "w1")}${wavePath(262, 8, 200, 1.1, "#7a3f9a", "w2")}${boat}${wavePath(300, 9, 170, 2.3, "#3a2f7a", "w3")}${wavePath(342, 8, 210, 3.5, "#1d2a66", "w4")}</svg>`;
}

/** The same picture as a still CSS background (for a dialog that rebuilds its content). */
export function hubArtUrl() {
  // A standalone SVG image needs its namespace; inline SVG in the page does not.
  const svg = hubArt().replace(
    "<svg ",
    '<svg xmlns="http://www.w3.org/2000/svg" ',
  );
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
