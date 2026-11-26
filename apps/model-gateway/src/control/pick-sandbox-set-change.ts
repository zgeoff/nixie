import type { PeriodChange, PeriodStore, SandboxLimit } from '../types';
import type { ControlOutcome } from './control-outcome';

// A new entry holds a zero count, and so does a set one. The limit's revision goes on from the
// entry it replaces, so a patch that read the earlier entry finds the limit changed.
export function pickSandboxSetChange(
  store: PeriodStore,
  name: string,
  limit: SandboxLimit | null,
): PeriodChange<ControlOutcome> {
  const held = Object.hasOwn(store.sandboxes, name) ? store.sandboxes[name] : undefined;

  return {
    store: {
      ...store,
      sandboxes: {
        ...store.sandboxes,
        [name]: {
          micros: 0,
          tokens: 0,
          limit,
          lastRefusal: null,
          limitRevision: (held?.limitRevision ?? 0) + 1,
        },
      },
    },
    result: { kind: 'done' },
  };
}
