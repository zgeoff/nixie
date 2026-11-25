import type { Measures, PeriodChange, PeriodStore } from '../types';
import type { ControlOutcome } from './control-outcome';

// A limit with no token ceiling holds the largest safe integer, which a count never reaches.
export const noTokenCeiling = Number.MAX_SAFE_INTEGER;

export interface SandboxLimitPatch {
  readonly dollars: number;
  readonly tokens?: number | undefined;
}

// Sets the limit of a sandbox whole and keeps its count. A name the store lacks changes nothing.
export function pickSandboxPatchChange(
  store: PeriodStore,
  name: string,
  limit: SandboxLimitPatch | null,
): PeriodChange<ControlOutcome> {
  const held = Object.hasOwn(store.sandboxes, name) ? store.sandboxes[name] : undefined;

  if (held === undefined) {
    return { store: null, result: { kind: 'not_found' } };
  }

  const measures: Measures | null =
    limit === null ? null : { dollars: limit.dollars, tokens: limit.tokens ?? noTokenCeiling };

  return {
    store: { ...store, sandboxes: { ...store.sandboxes, [name]: { ...held, limit: measures } } },
    result: { kind: 'done' },
  };
}
