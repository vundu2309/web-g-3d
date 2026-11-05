/**
 * Connecting to the shared sea must survive a sleeping server. A free Render
 * instance takes 30-60 s to wake, so one short attempt followed by an error was the
 * normal first experience. This retries with short pauses until a total deadline,
 * tells the caller when it is taking long, and never leaks a late connection.
 */
/** Messages for failures that retrying cannot fix: signed out, sea full, taken over elsewhere. */
export const fatalConnectionMessage =
  /đăng nhập|cửa sổ khác|đủ 100|chưa cấu hình/i;

export interface RetryOptions<T> {
  /** Give up after this long in total. */
  deadlineMs: number;
  /** One attempt may take at most this long before it is abandoned and retried. */
  attemptMs: number;
  /** Pause before the next attempt; the last value repeats. */
  delaysMs: number[];
  /** Fires once if connecting is taking this long (the server is probably waking up). */
  slowAfterMs: number;
  onSlow?: () => void;
  onAttempt?: (attempt: number) => void;
  /** Errors retrying cannot fix (signed out, sea full, not configured). */
  isFatal?: (error: unknown) => boolean;
  /** Closes a connection that arrived after its attempt had already timed out. */
  discard?: (value: T) => void;
}

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

export async function connectWithRetry<T>(
  attempt: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
  options: RetryOptions<T>,
): Promise<T> {
  const started = Date.now();
  const slowTimer = setTimeout(() => options.onSlow?.(), options.slowAfterMs);
  let lastError: unknown = new Error("Chưa kết nối được.");
  try {
    for (let n = 1; ; n++) {
      if (signal.aborted) throw lastError;
      options.onAttempt?.(n);
      const controller = new AbortController();
      const stop = () => controller.abort();
      signal.addEventListener("abort", stop, { once: true });
      let timer: ReturnType<typeof setTimeout> | undefined;
      let timedOut = false;
      try {
        return await new Promise<T>((resolve, reject) => {
          timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
            reject(new Error("Lần kết nối quá lâu."));
          }, options.attemptMs);
          attempt(controller.signal).then((value) => {
            if (timedOut || signal.aborted) options.discard?.(value);
            else resolve(value);
          }, reject);
        });
      } catch (error) {
        lastError = error;
        if (signal.aborted || options.isFatal?.(error)) throw error;
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", stop);
      }
      const delay =
        options.delaysMs[Math.min(n - 1, options.delaysMs.length - 1)] ?? 1000;
      if (Date.now() - started + delay >= options.deadlineMs) throw lastError;
      await pause(delay, signal);
    }
  } finally {
    clearTimeout(slowTimer);
  }
}
