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

/**
 * Tracks exactly one pointer on the stick; a second finger on it is ignored, and
 * fingers elsewhere (the fishing button) are independent. Returns `release`.
 */
export function bindStick(
  element: HTMLElement,
  knob: HTMLElement,
  options: StickOptions,
): () => void {
  const zone = options.zone ?? element;
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
  // The ring sits in a layer above the zone, so touches on it never reach the zone.
  const targets = zone === element ? [element] : [zone, element];
  for (const target of targets) {
    target.addEventListener(
      "pointerdown",
      (event) => {
        if (pointer !== undefined || !options.enabled()) return;
        event.preventDefault();
        // Measured before the ring moves: this is its home.
        const box = element.getBoundingClientRect();
        center = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
        // Travel keeps the knob edge inside the ring.
        radius = Math.max(1, (box.width - knob.offsetWidth) / 2);
        if (target !== element) {
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
        target.setPointerCapture(event.pointerId);
        element.classList.add("is-active");
        track(event);
      },
      { signal: options.signal },
    );
    target.addEventListener(
      "pointermove",
      (event) => {
        if (event.pointerId !== pointer) return;
        if (!options.enabled()) return release();
        track(event);
      },
      { signal: options.signal },
    );
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      target.addEventListener(
        type,
        (event) => {
          if ((event as PointerEvent).pointerId === pointer) release();
        },
        { signal: options.signal },
      );
  }
  return release;
}
