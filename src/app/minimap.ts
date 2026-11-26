import { SEA_BOUND } from "../ocean/model";
import {
  PLACES,
  arrowPoints,
  coastPoints,
  mapScale,
  islandsOnMap,
  toMap,
  type MapPoint,
  type Place,
} from "../ocean/minimap-math";
import { hullCss } from "../ocean/palette";
import { BUOYS } from "../ocean/sea-layout";

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

/**
 * A ring on the map for something that comes and goes (a hot spot, the event ring): drawn at 10 Hz
 * on top of the still layer, so it costs one `arc` each. The marks are shared by the corner map
 * and the big map (`setMapMarks`).
 */
export interface MapMark {
  x: number;
  z: number;
  /** The real radius (m); the ring is never drawn smaller than a few pixels. */
  radius: number;
  /** The ring of the hourly event: solid and brighter than a hot spot. */
  event?: boolean;
}
let marks: readonly MapMark[] = [];
export const setMapMarks = (next: readonly MapMark[]) => {
  marks = next;
};

const INK = "#153b80";
/** The gold of the game's coins, buttons and the player's arrow. */
const GOLD = "#ffd35a";

export interface MinimapOptions {
  /** The big map: a numbered badge by each named place (harbor, markets, shipyards), matching the list beside it. */
  badges?: boolean;
}

export function createMinimap(
  canvas: HTMLCanvasElement,
  options: MinimapOptions = {},
) {
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
    if (context) paintStill(context, size, options.badges === true);
  }

  function paintStill(
    c: CanvasRenderingContext2D,
    px: number,
    badges: boolean,
  ) {
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
    // The edge of the sea the boats cannot leave.
    const wallA = toMap(-SEA_BOUND, -SEA_BOUND, px);
    const wallB = toMap(SEA_BOUND, SEA_BOUND, px);
    c.setLineDash([unit * 2.5, unit * 2]);
    c.strokeStyle = "rgba(255,255,255,0.55)";
    c.lineWidth = Math.max(1, unit * 0.7);
    c.strokeRect(wallA.x, wallA.y, wallB.x - wallA.x, wallB.y - wallA.y);
    c.setLineDash([]);
    // Islands: shallow water, sand, grass and the shore line.
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
      trace(c, coastPoints(at, island.radius, index, 1));
      c.strokeStyle = INK;
      c.lineWidth = Math.max(1, unit * 0.7);
      c.lineJoin = "round";
      c.stroke();
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
    // The named places: a gold coin with a fish for each market, a gold disc with a boat for each
    // shipyard (bigger than a buoy, so they can be found from afar) and a white dock for the harbor;
    // the big map adds the number each has in its list.
    for (const place of PLACES) {
      const at = toMap(place.x, place.z, px);
      const r = placeIcon(c, place, at, unit);
      if (badges) numberBadge(c, place.number, at, r, unit);
    }
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

  /** Draws a place's icon at `at`; returns its radius (px) so a badge can sit on its edge. */
  function placeIcon(
    c: CanvasRenderingContext2D,
    place: Place,
    at: MapPoint,
    unit: number,
  ): number {
    c.lineJoin = "round";
    if (place.kind === "harbor") {
      c.fillStyle = "#fff";
      c.strokeStyle = INK;
      c.lineWidth = Math.max(1, unit * 0.9);
      c.beginPath();
      c.roundRect(at.x - unit * 3, at.y - unit * 2, unit * 6, unit * 4, unit);
      c.fill();
      c.stroke();
      return unit * 3;
    }
    const r = unit * 3.4;
    c.beginPath();
    c.arc(at.x, at.y, r, 0, Math.PI * 2);
    c.fillStyle = GOLD;
    c.fill();
    c.lineWidth = Math.max(1, unit * 0.9);
    c.strokeStyle = INK;
    c.stroke();
    c.fillStyle = INK;
    if (place.kind === "market") {
      // The fish: a body and a tail.
      c.beginPath();
      c.ellipse(at.x - r * 0.1, at.y, r * 0.46, r * 0.27, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.moveTo(at.x + r * 0.28, at.y);
      c.lineTo(at.x + r * 0.62, at.y - r * 0.3);
      c.lineTo(at.x + r * 0.62, at.y + r * 0.3);
      c.closePath();
      c.fill();
    } else {
      // The boat: a hull and a sail.
      c.beginPath();
      c.moveTo(at.x - r * 0.62, at.y + r * 0.12);
      c.lineTo(at.x + r * 0.62, at.y + r * 0.12);
      c.lineTo(at.x + r * 0.38, at.y + r * 0.5);
      c.lineTo(at.x - r * 0.38, at.y + r * 0.5);
      c.closePath();
      c.fill();
      c.beginPath();
      c.moveTo(at.x - r * 0.05, at.y + r * 0.04);
      c.lineTo(at.x - r * 0.05, at.y - r * 0.58);
      c.lineTo(at.x + r * 0.42, at.y + r * 0.04);
      c.closePath();
      c.fill();
    }
    return r;
  }

  /** A small navy disc with a white number on the upper right of a place's icon. */
  function numberBadge(
    c: CanvasRenderingContext2D,
    number: number,
    at: MapPoint,
    r: number,
    unit: number,
  ) {
    const radius = unit * 2.4;
    const x = at.x + r * 0.85;
    const y = at.y - r * 0.85;
    c.beginPath();
    c.arc(x, y, radius, 0, Math.PI * 2);
    c.fillStyle = INK;
    c.fill();
    c.lineWidth = Math.max(1, unit * 0.5);
    c.strokeStyle = "#fff";
    c.stroke();
    c.fillStyle = "#fff";
    c.font = `800 ${unit * 3.2}px "Baloo 2", sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(String(number), x, y + unit * 0.2);
    c.textBaseline = "alphabetic";
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
      if (marks.length) {
        const pulse = 0.5 + 0.5 * Math.sin(seconds * 2.2);
        context.save();
        context.setLineDash([unit * 1.4, unit * 1.1]);
        context.lineWidth = Math.max(1.2, unit * 0.6);
        context.strokeStyle = `rgba(233,165,47,${0.75 + 0.25 * pulse})`;
        context.fillStyle = `rgba(255,211,90,${0.16 + 0.1 * pulse})`;
        for (const mark of marks) {
          const at = toMap(mark.x, mark.z, size);
          const r = Math.max(
            unit * (mark.event ? 3.4 : 2.6),
            mark.radius * mapScale(size),
          );
          context.setLineDash(mark.event ? [] : [unit * 1.4, unit * 1.1]);
          context.lineWidth = Math.max(1.2, unit * (mark.event ? 1 : 0.6));
          context.beginPath();
          context.arc(at.x, at.y, r, 0, Math.PI * 2);
          context.fill();
          context.stroke();
        }
        context.restore();
      }
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
        arrow(context, at, self.heading, unit * 4.6, GOLD, outline * 1.1);
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
