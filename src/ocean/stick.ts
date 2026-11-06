/**
 * One-thumb boat stick. Up/down is throttle and left/right is steering, so a
 * diagonal drag runs and turns at the same time. The other thumb stays free for
 * the fishing button. Pure maths plus one pointer binding, no game state.
 */
export interface StickInput {
  steer: number;
  throttle: number;
}
export const STICK_DEADZONE = 0.14;

const axis = (value: number) => {
  const size = Math.abs(value);
  if (!(size > STICK_DEADZONE)) return 0;
  return (
    Math.sign(value) *
    Math.min(1, (size - STICK_DEADZONE) / (1 - STICK_DEADZONE))
  );
};

/** Knob offset in px, kept inside the circle of the given radius. */
export function stickKnob(dx: number, dy: number, radius: number) {
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || !(radius > 0)) return { x: 0, y: 0 };
  if (length <= radius) return { x: dx, y: dy };
  const scale = radius / length;
  return { x: dx * scale, y: dy * scale };
}

/** Analog boat input from a drag. Dragging up is forward, right is a right turn. */
export function stickInput(dx: number, dy: number, radius: number): StickInput {
  const knob = stickKnob(dx, dy, radius);
  if (!(radius > 0)) return { steer: 0, throttle: 0 };
  return {
    steer: axis(knob.x / radius) + 0,
    throttle: axis(-knob.y / radius) + 0,
  };
}

/**
 * Where a floating stick centres for a touch at (x, y): under the thumb, but kept
 * far enough inside the screen that the whole ring stays visible and reachable.
 */
export function floatingCenter(
  x: number,
  y: number,
  radius: number,
  width: number,
  height: number,
) {
  const clamp = (value: number, size: number) =>
    size > radius * 2
      ? Math.min(size - radius, Math.max(radius, value))
      : size / 2;
  return { x: clamp(x, width), y: clamp(y, height) };
}

export interface StickOptions {
  /** False while a dialog is open or the boat is not connected. */
  enabled: () => boolean;
  /**
   * A larger touch area. A touch inside it that starts off the ring makes the ring
   * jump under the thumb (a floating stick); it returns home on release. Without it
   * only the ring itself takes touches.
   */
  zone?: HTMLElement;
  onChange: (input: StickInput) => void;
  signal: AbortSignal;
}

/** The stick's state machine, fed pointer events by whoever owns the touches. */
export interface StickController {
  /** Starts a drag. `floating` makes the ring jump under the thumb. False if refused. */
  down(event: PointerEvent, floating: boolean): boolean;
  move(event: PointerEvent): void;
  /** Ends the drag for this pointer (up, cancel, or capture lost). */
  up(event: PointerEvent): void;
  /** The pointer currently held, if any. */
  readonly pointer: number | undefined;
  /** Lets go whatever is held: the boat stops and the ring goes home. */
  release(): void;
}

export function createStick(
  element: HTMLElement,
  knob: HTMLElement,
  options: Pick<StickOptions, "enabled" | "onChange">,
): StickController {
  let pointer: number | undefined;
  let center = { x: 0, y: 0 };
  let radius = 1;
  const place = (x: number, y: number) => {
    knob.style.transform = x || y ? `translate(${x}px, ${y}px)` : "";
  };
  const release = () => {
    const wasDown = pointer !== undefined;
    pointer = undefined;
    element.classList.remove("is-active");
    element.style.transform = "";
    place(0, 0);
    if (wasDown) options.onChange({ steer: 0, throttle: 0 });
  };
  const track = (event: PointerEvent) => {
    const dx = event.clientX - center.x;
    const dy = event.clientY - center.y;
    const knobAt = stickKnob(dx, dy, radius);
    place(knobAt.x, knobAt.y);
    options.onChange(stickInput(dx, dy, radius));
  };
  return {
    get pointer() {
      return pointer;
    },
    release,
    down(event, floating) {
      if (pointer !== undefined || !options.enabled()) return false;
      // Measured before the ring moves: this is its home.
      const box = element.getBoundingClientRect();
      center = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      // Travel keeps the knob edge inside the ring.
      radius = Math.max(1, (box.width - knob.offsetWidth) / 2);
      if (floating) {
        const at = floatingCenter(
          event.clientX,
          event.clientY,
          box.width / 2,
          innerWidth,
          innerHeight,
        );
        element.style.transform = `translate(${at.x - center.x}px, ${at.y - center.y}px)`;
        center = at;
      }
      pointer = event.pointerId;
      element.classList.add("is-active");
      track(event);
      return true;
    },
    move(event) {
      if (event.pointerId !== pointer) return;
      if (!options.enabled()) return release();
      track(event);
    },
    up(event) {
      if (event.pointerId === pointer) release();
    },
  };
}

/**
 * The stick listening for its own pointer events (the ring, and optionally a larger
 * zone). The game uses the shared input layer instead; this stays for simple pages
 * and for the real-touch test. Returns `release`.
 */
export function bindStick(
  element: HTMLElement,
  knob: HTMLElement,
  options: StickOptions,
): () => void {
  const stick = createStick(element, knob, options);
  const zone = options.zone ?? element;
  // The ring sits in a layer above the zone, so touches on it never reach the zone.
  const targets = zone === element ? [element] : [zone, element];
  for (const target of targets) {
    target.addEventListener(
      "pointerdown",
      (event) => {
        if (stick.pointer !== undefined || !options.enabled()) return;
        event.preventDefault();
        if (stick.down(event, target !== element)) {
          try {
            target.setPointerCapture(event.pointerId);
          } catch {
            /* A stale pointer id: events still arrive while it is over the target. */
          }
        }
      },
      { signal: options.signal },
    );
    target.addEventListener("pointermove", (event) => stick.move(event), {
      signal: options.signal,
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      target.addEventListener(
        type,
        (event) => stick.up(event as PointerEvent),
        {
          signal: options.signal,
        },
      );
  }
  return stick.release;
}
