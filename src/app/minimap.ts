import { SEA_BOUND, HARBOR } from "../ocean/model";
import {
  arrowPoints,
  coastPoints,
  mapScale,
  islandsOnMap,
  toMap,
  type MapPoint,
} from "../ocean/minimap-math";
import { hullCss } from "../ocean/palette";
import { BUOYS } from "../ocean/sea-layout";
import { MARKETS } from "../ocean/market";

/**
 * A small map of the whole sea in the corner of the screen: islands, the harbor, the
 * channel buoys, the other boats (in their hull colours) and the player (a yellow arrow
 * that points where the boat heads). It is only drawn: no touch goes to it. The sea,
 * islands and buoys are painted once into an off-screen layer; each update only copies it
 * and draws the boats, so it is cheap to redraw several times a second.
 */
export interface MapBoat {
  uid: string;
  x: number;
  z: number;
  heading: number;
  fishing: boolean;
}

const INK = "#153b80";

export function createMinimap(canvas: HTMLCanvasElement) {
  let size = 0;
  let layer: HTMLCanvasElement | undefined;

  /** Matches the canvas to its CSS size (sharp on a phone) and repaints the still layer. */
  function fit() {
    const css = canvas.clientWidth || 100;
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    const next = Math.round(css * ratio);
    if (next === size && layer) return;
    size = next;
    canvas.width = size;
    canvas.height = size;
    layer = document.createElement("canvas");
    layer.width = size;
    layer.height = size;
    const context = layer.getContext("2d");
    if (context) paintStill(context, size);
  }

  function paintStill(c: CanvasRenderingContext2D, px: number) {
    const unit = px / 100;
    // The sea, a little deeper toward the edges.
    const sea = c.createRadialGradient(
      px / 2,
      px / 2,
      px * 0.1,
      px / 2,
      px / 2,
      px * 0.75,
    );
    sea.addColorStop(0, "#8fd0ec");
    sea.addColorStop(1, "#4aa3cf");
    c.fillStyle = sea;
    c.fillRect(0, 0, px, px);
    // A faint grid, one line every 60 m.
    c.strokeStyle = "rgba(255,255,255,0.22)";
    c.lineWidth = Math.max(1, unit * 0.5);
    for (let m = -180; m <= 180; m += 60) {
      const a = toMap(m, m, px);
      c.beginPath();
      c.moveTo(a.x, 0);
      c.lineTo(a.x, px);
      c.moveTo(0, a.y);
      c.lineTo(px, a.y);
      c.stroke();
    }
    // The edge of the sea the boats cannot leave.
    const wallA = toMap(-SEA_BOUND, -SEA_BOUND, px);
    const wallB = toMap(SEA_BOUND, SEA_BOUND, px);
    c.setLineDash([unit * 2.5, unit * 2]);
    c.strokeStyle = "rgba(255,255,255,0.55)";
    c.lineWidth = Math.max(1, unit * 0.7);
    c.strokeRect(wallA.x, wallA.y, wallB.x - wallA.x, wallB.y - wallA.y);
    c.setLineDash([]);
    // Islands: shallow water, sand, grass, a hill and the shore line.
    const trace = (c2: CanvasRenderingContext2D, pts: MapPoint[]) => {
      c2.beginPath();
      pts.forEach((pt, i) =>
        i ? c2.lineTo(pt.x, pt.y) : c2.moveTo(pt.x, pt.y),
      );
      c2.closePath();
    };
    islandsOnMap(px).forEach((island, index) => {
      const at = { x: island.x, y: island.y };
      // The real coast (scale 1 is the waterline), the turquoise shelf beyond it.
      trace(c, coastPoints(at, island.radius, index, 1.4));
      c.fillStyle = "rgba(190,240,240,0.55)";
      c.fill();
      trace(c, coastPoints(at, island.radius, index, 1));
      c.fillStyle = "#f2dca2";
      c.fill();
      trace(c, coastPoints(at, island.radius, index, 0.84));
      c.fillStyle = "#6fb85f";
      c.fill();
      trace(
        c,
        coastPoints(
          { x: at.x + unit * 0.4, y: at.y - unit * 0.4 },
          island.radius,
          index,
          0.42,
        ),
      );
      c.fillStyle = "#4f9a4e";
      c.fill();
      trace(c, coastPoints(at, island.radius, index, 1));
      c.strokeStyle = INK;
      c.lineWidth = Math.max(1, unit * 0.7);
      c.lineJoin = "round";
      c.stroke();
      // A few palms on the grass.
      c.fillStyle = "#2f7a3f";
      for (let k = 0; k < 4; k++) {
        const a = k * 2.1 + index;
        c.beginPath();
        c.arc(
          at.x + Math.cos(a) * island.radius * 0.55,
          at.y + Math.sin(a) * island.radius * 0.55,
          Math.max(1, unit * 0.9),
          0,
          Math.PI * 2,
        );
        c.fill();
      }
      // The lighthouse island: a red and white tower.
      if (index === 0) {
        c.fillStyle = "#fff";
        c.strokeStyle = INK;
        c.lineWidth = Math.max(1, unit * 0.5);
        c.fillRect(at.x - unit * 1, at.y - unit * 3.4, unit * 2, unit * 4);
        c.strokeRect(at.x - unit * 1, at.y - unit * 3.4, unit * 2, unit * 4);
        c.fillStyle = "#e0554b";
        c.fillRect(
          at.x - unit * 1.3,
          at.y - unit * 4.6,
          unit * 2.6,
          unit * 1.3,
        );
      }
    });
    // Channel buoys.
    for (const buoy of BUOYS) {
      const at = toMap(buoy.x, buoy.z, px);
      c.beginPath();
      c.arc(at.x, at.y, unit * 1.3, 0, Math.PI * 2);
      c.fillStyle = buoy.color === "red" ? "#e0554b" : "#2f9a6a";
      c.fill();
      c.strokeStyle = "#fff";
      c.lineWidth = Math.max(1, unit * 0.5);
      c.stroke();
    }
    // The fish markets: a gold coin with a small fish on it, bigger than a buoy so it can be
    // found from afar.
    for (const market of MARKETS) {
      const at = toMap(market.x, market.z, px);
      const r = unit * 3.4;
      c.beginPath();
      c.arc(at.x, at.y, r, 0, Math.PI * 2);
      c.fillStyle = "#ffd35a";
      c.fill();
      c.lineWidth = Math.max(1, unit * 0.9);
      c.strokeStyle = INK;
      c.stroke();
      // The fish: a body and a tail.
      c.fillStyle = INK;
      c.beginPath();
      c.ellipse(at.x - r * 0.1, at.y, r * 0.46, r * 0.27, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.moveTo(at.x + r * 0.28, at.y);
      c.lineTo(at.x + r * 0.62, at.y - r * 0.3);
      c.lineTo(at.x + r * 0.62, at.y + r * 0.3);
      c.closePath();
      c.fill();
    }
    // The harbor: a small white dock.
    const harbor = toMap(HARBOR.x, HARBOR.z, px);
    c.fillStyle = "#fff";
    c.strokeStyle = INK;
    c.lineWidth = Math.max(1, unit * 0.7);
    c.beginPath();
    c.roundRect(
      harbor.x - unit * 3,
      harbor.y - unit * 2,
      unit * 6,
      unit * 4,
      unit,
    );
    c.fill();
    c.stroke();
    // A scale bar: 100 m.
    const bar = mapScale(px) * 100;
    c.strokeStyle = INK;
    c.lineWidth = Math.max(1.5, unit * 0.9);
    c.beginPath();
    c.moveTo(unit * 6, px - unit * 7);
    c.lineTo(unit * 6 + bar, px - unit * 7);
    c.stroke();
    c.fillStyle = INK;
    c.font = `700 ${unit * 5.2}px "Baloo 2", sans-serif`;
    c.textAlign = "left";
    c.fillText("100 m", unit * 6, px - unit * 9);
    // North.
    c.fillStyle = INK;
    c.font = `800 ${unit * 8}px "Baloo 2", sans-serif`;
    c.textAlign = "center";
    c.fillText("N", px / 2, unit * 9);
  }

  function arrow(
    c: CanvasRenderingContext2D,
    at: MapPoint,
    heading: number,
    length: number,
    fill: string,
    outline: number,
  ) {
    const [tip, left, right] = arrowPoints(at, heading, length);
    c.beginPath();
    c.moveTo(tip.x, tip.y);
    c.lineTo(left.x, left.y);
    c.lineTo(right.x, right.y);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = outline;
    c.lineJoin = "round";
    c.stroke();
  }

  return {
    /** Redraws with the player's pose and the other boats. */
    update(
      self: MapBoat | undefined,
      others: readonly MapBoat[],
      seconds: number,
    ) {
      fit();
      const context = canvas.getContext("2d");
      if (!context || !layer) return;
      context.clearRect(0, 0, size, size);
      context.drawImage(layer, 0, 0);
      const unit = size / 100;
      const outline = Math.max(1, unit * 0.7);
      for (const boat of others) {
        const at = toMap(boat.x, boat.z, size);
        if (boat.fishing) {
          context.beginPath();
          context.arc(at.x, at.y, unit * 3.4, 0, Math.PI * 2);
          context.strokeStyle = "rgba(255,255,255,0.9)";
          context.lineWidth = outline;
          context.stroke();
        }
        arrow(
          context,
          at,
          boat.heading,
          unit * 3.4,
          hullCss(boat.uid),
          outline,
        );
      }
      if (self) {
        const at = toMap(self.x, self.z, size);
        // A soft pulse around the player so it is easy to find.
        const pulse = 0.5 + 0.5 * Math.sin(seconds * 3.2);
        context.beginPath();
        context.arc(at.x, at.y, unit * (4.6 + 1.6 * pulse), 0, Math.PI * 2);
        context.fillStyle = `rgba(255,211,90,${0.28 - 0.14 * pulse})`;
        context.fill();
        arrow(context, at, self.heading, unit * 4.6, "#ffd35a", outline * 1.1);
        if (self.fishing) {
          context.beginPath();
          context.arc(at.x, at.y, unit * 7.2, 0, Math.PI * 2);
          context.strokeStyle = "#fff";
          context.lineWidth = outline;
          context.stroke();
        }
      }
    },
  };
}
