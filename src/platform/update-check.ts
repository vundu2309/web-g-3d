/**
 * The "is there a newer version?" check behind the Settings screen, as plain logic over the
 * parts of a service worker registration it needs, so it can be tested without a browser.
 *
 * It never reloads anything: it only reports. The player decides when to reload, because a
 * reload during a game is the player's call (see registerShell in pwa.ts).
 */
export type UpdateResult =
  /** Nothing newer than what is running. */
  | "latest"
  /** A newer version is downloaded and waits for a reload. */
  | "ready"
  /** The check could not finish (offline, server down, the new files did not all download). */
  | "failed";

export interface WorkerLike {
  readonly state: string;
  addEventListener(type: "statechange", listener: () => void): void;
  removeEventListener(type: "statechange", listener: () => void): void;
}

export interface RegistrationLike {
  update(): Promise<unknown>;
  readonly installing: WorkerLike | null;
  readonly waiting: WorkerLike | null;
}

export interface CheckOptions {
  /** True when a new version is already active but this page still runs the old one. */
  pending?: () => boolean;
  /** How long to wait for a new version to finish downloading, in ms. */
  settleMs?: number;
}

type Outcome = "installed" | "activated" | "redundant" | "timeout";

/** Waits for a worker that is installing to reach a final state. */
function settle(worker: WorkerLike, ms: number): Promise<Outcome> {
  return new Promise((resolve) => {
    const finish = (outcome: Outcome) => {
      clearTimeout(timer);
      worker.removeEventListener("statechange", onChange);
      resolve(outcome);
    };
    const onChange = () => {
      const { state } = worker;
      if (
        state === "installed" ||
        state === "activated" ||
        state === "redundant"
      )
        finish(state);
    };
    const timer = setTimeout(() => finish("timeout"), ms);
    worker.addEventListener("statechange", onChange);
    onChange();
  });
}

export async function checkForUpdate(
  registration: RegistrationLike,
  { pending = () => false, settleMs = 20_000 }: CheckOptions = {},
): Promise<UpdateResult> {
  try {
    await registration.update();
  } catch {
    return "failed";
  }
  const installing = registration.installing;
  if (installing) {
    const outcome = await settle(installing, settleMs);
    // A worker that went redundant failed to install; one still installing after the wait
    // has not finished downloading. Neither is "up to date".
    return outcome === "installed" || outcome === "activated"
      ? "ready"
      : "failed";
  }
  // The new worker may have installed and taken over before update() returned.
  return registration.waiting || pending() ? "ready" : "latest";
}
