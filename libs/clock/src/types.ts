export interface Clock {
  readonly now: () => number;

  // A sleep resolves early, and never rejects, when its signal aborts.
  readonly sleep: (durationMs: number, signal?: AbortSignal) => Promise<void>;
}

export interface WorkTracker {
  readonly runWork: <T>(work: () => Promise<T>) => Promise<T>;
}
