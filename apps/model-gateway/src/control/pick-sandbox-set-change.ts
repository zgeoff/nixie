import type { PeriodChange, PeriodStore, SandboxLimit } from '../types';
import type { ControlOutcome } from './control-outcome';
import { pickNextLimitRevision } from './pick-next-limit-revision';

// A new entry holds a zero count, and so does a set one. Its limit takes a revision that no entry of
// the name had before, so a patch that read an earlier entry finds the limit changed.
export function pickSandboxSetChange(
  store: PeriodStore,
  name: string,
  limit: SandboxLimit | null,
): PeriodChange<ControlOutcome> {
  const limitRevision = pickNextLimitRevision(store, name);

  return {
    store: {
      ...store,
      lastLimitRevision: limitRevision,
      sandboxes: {
        ...store.sandboxes,
        [name]: { micros: 0, tokens: 0, limit, lastRefusal: null, limitRevision },
      },
    },
    result: { kind: 'done' },
  };
}
