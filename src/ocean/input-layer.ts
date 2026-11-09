import type { StickController } from "./stick.ts";

/**
 * One transparent layer takes every touch on the sea screen. The controls under it are
 * only drawn (they have pointer-events: none), so a long press never lands on a
 * button, text, an icon or a link: there is nothing for the browser to turn into a
 * context menu, a callout or a text selection, and nothing that can cancel a held
 * action. The layer finds which control a touch belongs to by position, keeps one
 * route per finger (so the stick and the fishing button work at the same time) and
 * blocks the browser's own long-press behaviour.
 *
 * The controls stay real buttons in the page for the keyboard and assistive
 * technology: their `click` still works, it just never comes from a finger.
 */

/** Smallest touch target in px. A control may be drawn smaller, but not hit smaller. */
export const MIN_HIT = 44;

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A box grown (never shrunk) around its centre to at least `min` in each direction. */
export function inflate(box: Box, min: number = MIN_HIT): Box {
  const grow = (low: number, high: number): [number, number] => {
    const size = high - low;
    if (size >= min) return [low, high];
    const middle = (low + high) / 2;
    return [middle - min / 2, middle + min / 2];
  };
  const [left, right] = grow(box.left, box.right);
  const [top, bottom] = grow(box.top, box.bottom);
  return { left, top, right, bottom };
}

export const inside = (box: Box, x: number, y: number) =>
  x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

export interface InputTarget {
  element: HTMLElement;
  /** `press` acts when the finger lands and again when it lifts; `tap` acts on lift. */
  kind: "press" | "tap";
  enabled?: () => boolean;
  down?: () => void;
  up?: () => void;
  tap?: () => void;
}

export interface InputLayerOptions {
  /** Checked in order: the first control under the finger wins. */
  targets: () => readonly InputTarget[];
  stick?: {
    controller: StickController;
    /** The ring at home. A touch on it grabs it where it is; elsewhere in the zone it jumps. */
    ring: HTMLElement;
    zone: HTMLElement;
    enabled: () => boolean;
  };
  /** A finger dragged on open sea (no control, not the stick) looks around. */
  look?: {
    enabled: () => boolean;
    /** The finger went down (true) or up (false). */
    hold: (on: boolean) => void;
    /** The finger moved by this many pixels. */
    drag: (dx: number, dy: number) => void;
  };
  signal: AbortSignal;
}

type Route =
  | { kind: "stick" }
  | { kind: "look"; x: number; y: number }
  | { kind: "press"; target: InputTarget }
  | { kind: "tap"; target: InputTarget };

const PRESSED = "is-pressed";

function usable(target: InputTarget) {
  const element = target.element;
  if (element instanceof HTMLButtonElement && element.disabled) return false;
  if (element.getClientRects().length === 0) return false;
  return target.enabled ? target.enabled() : true;
}

const boxOf = (element: HTMLElement): Box => {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
  };
};

/** Starts listening on `layer`. Returns a function that ends every held touch. */
export function bindInputLayer(
  layer: HTMLElement,
  options: InputLayerOptions,
): () => void {
  const routes = new Map<number, Route>();
  /** Keeps the finger's events coming when it slides off the layer. May fail for a stale id. */
  const capture = (id: number) => {
    try {
      layer.setPointerCapture(id);
    } catch {
      /* The pointer is already gone; the route still works for its own events. */
    }
  };
  const pick = (x: number, y: number) =>
    options
      .targets()
      .find(
        (target) =>
          usable(target) && inside(inflate(boxOf(target.element)), x, y),
      );
  const finish = (id: number, cancelled: boolean, x: number, y: number) => {
    const route = routes.get(id);
    if (!route) return;
    routes.delete(id);
    if (route.kind === "stick") return;
    if (route.kind === "look") {
      options.look?.hold(false);
      return;
    }
    route.target.element.classList.remove(PRESSED);
    if (route.kind === "press") route.target.up?.();
    else if (!cancelled && inside(inflate(boxOf(route.target.element)), x, y))
      route.target.tap?.();
  };
  const listen = <K extends keyof HTMLElementEventMap>(
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
  ) => layer.addEventListener(type, handler, { signal: options.signal });

  listen("pointerdown", (event) => {
    event.preventDefault();
    if (routes.has(event.pointerId)) return;
    const target = pick(event.clientX, event.clientY);
    if (target) {
      routes.set(event.pointerId, { kind: target.kind, target });
      target.element.classList.add(PRESSED);
      capture(event.pointerId);
      if (target.kind === "press") target.down?.();
      return;
    }
    const stick = options.stick;
    if (
      stick &&
      stick.enabled() &&
      inside(boxOf(stick.zone), event.clientX, event.clientY)
    ) {
      const onRing = inside(boxOf(stick.ring), event.clientX, event.clientY);
      if (stick.controller.down(event, !onRing)) {
        routes.set(event.pointerId, { kind: "stick" });
        capture(event.pointerId);
        return;
      }
    }
    // Anywhere else on the sea: a drag looks around the boat.
    if (options.look?.enabled()) {
      routes.set(event.pointerId, {
        kind: "look",
        x: event.clientX,
        y: event.clientY,
      });
      capture(event.pointerId);
      options.look.hold(true);
    }
  });
  listen("pointermove", (event) => {
    const route = routes.get(event.pointerId);
    if (route?.kind === "stick") options.stick?.controller.move(event);
    else if (route?.kind === "look") {
      options.look?.drag(event.clientX - route.x, event.clientY - route.y);
      route.x = event.clientX;
      route.y = event.clientY;
    }
  });
  const lift = (event: PointerEvent, cancelled: boolean) => {
    const route = routes.get(event.pointerId);
    if (route?.kind === "stick") {
      routes.delete(event.pointerId);
      options.stick?.controller.up(event);
      return;
    }
    finish(event.pointerId, cancelled, event.clientX, event.clientY);
  };
  listen("pointerup", (event) => lift(event, false));
  // A cancelled touch (the system took it) is a lift: nothing is left held down.
  listen("pointercancel", (event) => lift(event, true));
  listen("lostpointercapture", (event) => lift(event, true));
  // The browser's long-press behaviour: menus, callouts, selection and drags.
  for (const type of ["contextmenu", "selectstart", "dragstart"] as const)
    listen(type, (event) => event.preventDefault());

  return () => {
    for (const [id, route] of [...routes]) {
      routes.delete(id);
      if (route.kind === "stick") continue;
      if (route.kind === "look") {
        options.look?.hold(false);
        continue;
      }
      route.target.element.classList.remove(PRESSED);
      if (route.kind === "press") route.target.up?.();
    }
    options.stick?.controller.release();
  };
}
