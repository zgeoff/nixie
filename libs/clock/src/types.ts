import type { Clock as StdClock } from '@zgeoff/std';

// Nixie reads the time and waits, and never schedules, so it takes the two methods it calls.
export type Clock = Pick<StdClock, 'now' | 'sleep'>;

export interface WorkTracker {
  readonly runWork: <T>(work: () => Promise<T>) => Promise<T>;
}
