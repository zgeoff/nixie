// The one clock that every part reads for the time and every wait, in milliseconds since the epoch.
// A test build passes a clock the test sets and advances, so no test sleeps to let time pass. A
// sleep resolves early, never rejects, when its signal aborts.
export interface Clock {
  readonly now: () => number;
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
}
