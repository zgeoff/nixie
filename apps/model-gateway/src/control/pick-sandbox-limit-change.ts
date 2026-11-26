import type { PeriodChange, PeriodStore, SandboxLimit } from '../types';
import type { ControlOutcome } from './control-outcome';

// Sets a sandbox's limit whole and keeps its count and its last refusal. A name the store lacks
// changes nothing.
export function pickSandboxLimitChange(
  store: PeriodStore,
  name: string,
  limit: SandboxLimit | null,
): PeriodChange<ControlOutcome> {
  const held = Object.hasOwn(store.sandboxes, name) ? store.sandboxes[name] : undefined;

  if (held === undefined) {
    return { store: null, result: { kind: 'unknown_sandbox' } };
  }

  return {
    store: { ...store, sandboxes: { ...store.sandboxes, [name]: { ...held, limit } } },
    result: { kind: 'done' },
  };
}
