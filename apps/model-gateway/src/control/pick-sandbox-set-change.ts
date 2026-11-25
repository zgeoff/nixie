import type { Measures, PeriodChange, PeriodStore } from '../types';
import type { ControlOutcome } from './control-outcome';

// a new entry holds a zero count, and so does a set one
export function pickSandboxSetChange(
  store: PeriodStore,
  name: string,
  limit: Measures | null,
): PeriodChange<ControlOutcome> {
  return {
    store: {
      ...store,
      sandboxes: {
        ...store.sandboxes,
        [name]: { dollars: 0, tokens: 0, limit, lastRefusal: null },
      },
    },
    result: { kind: 'done' },
  };
}
