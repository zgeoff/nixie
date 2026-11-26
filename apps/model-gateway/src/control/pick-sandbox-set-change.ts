import type { PeriodChange, PeriodStore, SandboxLimit } from '../types';
import type { ControlOutcome } from './control-outcome';

// a new entry holds a zero count, and so does a set one
export function pickSandboxSetChange(
  store: PeriodStore,
  name: string,
  limit: SandboxLimit | null,
): PeriodChange<ControlOutcome> {
  return {
    store: {
      ...store,
      sandboxes: {
        ...store.sandboxes,
        [name]: { micros: 0, tokens: 0, limit, lastRefusal: null },
      },
    },
    result: { kind: 'done' },
  };
}
