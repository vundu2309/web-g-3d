export type Stage =
  | "sdk"
  | "session"
  | "token"
  | "room_read"
  | "profile_read"
  | "prepare"
  | "transaction"
  | "commit_wait"
  | "first_snapshot"
  | "render";
export interface Sample {
  stage: Stage;
  ms: number;
  attempt?: number;
  outcome: "pending" | "ok" | "error" | "retry" | "cached" | "unfinished";
  code?: string;
}
export interface Report {
  action: "create" | "join";
  mode: "online" | "demo";
  totalMs: number;
  finished: boolean;
  outcome: "running" | "ok" | "error";
  attempts: number;
  samples: Sample[];
  code?: string;
}
function safeCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" && /^[a-z][a-z0-9/-]{0,60}$/.test(code)
    ? code
    : undefined;
}
export class Trace {
  private start: number;
  private stopped = false;
  private report: Report;
  private update: (report: Report) => void;
  private now: () => number;
  constructor(
    action: Report["action"],
    mode: Report["mode"],
    update: (report: Report) => void,
    now = () => performance.now(),
  ) {
    this.update = update;
    this.now = now;
    this.start = now();
    this.report = {
      action,
      mode,
      totalMs: 0,
      finished: false,
      outcome: "running",
      attempts: 0,
      samples: [],
    };
    this.emit();
  }
  private emit() {
    this.report.totalMs = Math.round(this.now() - this.start);
    this.update(structuredClone(this.report));
  }
  time() {
    return this.now();
  }
  attempt() {
    if (this.stopped) return this.report.attempts;
    this.report.attempts++;
    this.emit();
    return this.report.attempts;
  }
  begin(stage: Stage, attempt?: number) {
    const start = this.now();
    const sample: Sample = {
      stage,
      ms: 0,
      outcome: "pending",
      ...(attempt ? { attempt } : {}),
    };
    if (!this.stopped && this.report.samples.length < 100) {
      this.report.samples.push(sample);
      this.emit();
    }
    let ended = false;
    return (outcome: Sample["outcome"] = "ok", error?: unknown) => {
      if (this.stopped || ended) return;
      ended = true;
      sample.ms = Math.max(0, Math.round(this.now() - start));
      sample.outcome = outcome;
      const code = safeCode(error);
      if (code) sample.code = code;
      this.emit();
    };
  }
  add(
    stage: Stage,
    start: number,
    outcome: Sample["outcome"] = "ok",
    attempt?: number,
  ) {
    if (this.stopped || this.report.samples.length >= 100) return;
    this.report.samples.push({
      stage,
      ms: Math.max(0, Math.round(this.now() - start)),
      outcome,
      ...(attempt ? { attempt } : {}),
    });
    this.emit();
  }
  sync<T>(stage: Stage, work: () => T, attempt?: number): T {
    const end = this.begin(stage, attempt);
    try {
      const result = work();
      end();
      return result;
    } catch (error) {
      end("error", error);
      throw error;
    }
  }
  async measure<T>(
    stage: Stage,
    work: () => Promise<T>,
    attempt?: number,
  ): Promise<T> {
    const end = this.begin(stage, attempt);
    try {
      const result = await work();
      end();
      return result;
    } catch (error) {
      end("error", error);
      throw error;
    }
  }
  finish(outcome: "ok" | "error" = "ok", error?: unknown) {
    if (this.stopped) return;
    for (const sample of this.report.samples)
      if (sample.outcome === "pending") sample.outcome = "unfinished";
    this.report.finished = true;
    this.report.outcome = outcome;
    this.report.code = safeCode(error);
    this.emit();
    this.stopped = true;
  }
}
