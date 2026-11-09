/**
 * The look-around of the chase camera, as plain numbers (no Babylon, so it is tested
 * directly). A finger dragged on the sea turns the camera around the boat (yaw) and tips it
 * higher or lower (pitch). Let go and it stays where it is while the boat sits still; once
 * the boat moves it drifts slowly back to the default view behind the boat, so steering
 * never has to be done through an odd angle.
 */
export const ORBIT = {
  /** Radians of yaw per pixel dragged. */
  yawPerPixel: 0.0065,
  /** Radians of pitch per pixel dragged (up lowers the camera, like pulling the view). */
  pitchPerPixel: 0.0042,
  /** Lowest and highest pitch change from the default (rad). */
  pitchMin: -0.3,
  pitchMax: 0.8,
  /** How fast the view returns while the boat moves (1 / seconds; 0.7 takes about 3 s). */
  returnRate: 0.7,
  /** The boat counts as moving above this speed over the water (m/s). */
  movingSpeed: 1.2,
} as const;

const TAU = Math.PI * 2;
const wrap = (angle: number) =>
  angle - TAU * Math.floor((angle + Math.PI) / TAU);
const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

export class OrbitCamera {
  /** Turn around the boat from the default (rad, 0 is straight behind; positive is toward the boat's left). */
  yaw = 0;
  /** Tip up (positive) or down from the default (rad). */
  pitch = 0;
  private held = false;

  /** A finger is down on the sea: the view stays put while it is. */
  hold(on: boolean) {
    this.held = on;
  }

  get holding() {
    return this.held;
  }

  /** The finger moved by (dx, dy) pixels. Dragging right swings the camera to the boat's left, so the sea follows the finger. */
  drag(dx: number, dy: number) {
    this.yaw = wrap(this.yaw + dx * ORBIT.yawPerPixel);
    this.pitch = clamp(
      this.pitch + dy * ORBIT.pitchPerPixel,
      ORBIT.pitchMin,
      ORBIT.pitchMax,
    );
  }

  /** True while the view is away from the default. */
  get away() {
    return Math.abs(this.yaw) > 0.01 || Math.abs(this.pitch) > 0.01;
  }

  /** Eases back toward the default while the boat moves and no finger is down. */
  step(seconds: number, speed: number) {
    if (this.held || Math.abs(speed) < ORBIT.movingSpeed) return;
    const k = 1 - Math.exp(-ORBIT.returnRate * Math.max(0, seconds));
    this.yaw -= this.yaw * k;
    this.pitch -= this.pitch * k;
    if (!this.away) {
      this.yaw = 0;
      this.pitch = 0;
    }
  }

  reset() {
    this.yaw = 0;
    this.pitch = 0;
  }
}
