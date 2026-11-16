import type { PeriodChange, PeriodStore } from '../types';
import type { ControlOutcome } from './control-outcome';

export function pickSandboxRemoveChange(
  store: PeriodStore,
  name: string,
): PeriodChange<ControlOutcome> {
  if (!Object.hasOwn(store.sandboxes, name)) {
    return { store: null, result: { kind: 'done' } };
  }

  const kept = Object.fromEntries(Object.entries(store.sandboxes).filter(([key]) => key !== name));

  return { store: { ...store, sandboxes: kept }, result: { kind: 'done' } };
}
