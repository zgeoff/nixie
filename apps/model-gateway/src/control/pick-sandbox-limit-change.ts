import type { PeriodChange, PeriodStore, SandboxLimit } from '../types';
import type { ControlOutcome } from './control-outcome';
import { pickNextLimitRevision } from './pick-next-limit-revision';

export interface SandboxLimitPatch {
  readonly limit: SandboxLimit | null;

  // the limit revision that the caller read, which the sandbox must still hold
  readonly revision?: number;
}

// Sets a sandbox's limit whole and keeps its count and its last refusal. A name the store lacks
// changes nothing, and so does a patch that names a revision other than the limit's own, because a
// newer write landed after the read the patch was decided on.
export function pickSandboxLimitChange(
  store: PeriodStore,
  name: string,
  patch: SandboxLimitPatch,
): PeriodChange<ControlOutcome> {
  const held = Object.hasOwn(store.sandboxes, name) ? store.sandboxes[name] : undefined;

  if (held === undefined) {
    return { store: null, result: { kind: 'unknown_sandbox' } };
  }

  if (patch.revision !== undefined && patch.revision !== held.limitRevision) {
    return { store: null, result: { kind: 'revision_changed' } };
  }

  const limitRevision = pickNextLimitRevision(store, name);

  return {
    store: {
      ...store,
      lastLimitRevision: limitRevision,
      sandboxes: { ...store.sandboxes, [name]: { ...held, limit: patch.limit, limitRevision } },
    },
    result: { kind: 'done' },
  };
}
