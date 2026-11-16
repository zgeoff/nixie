import type { Effect } from '../types';

const queuedEffects: ReadonlySet<Effect> = new Set(['write', 'delete', 'send', 'spend', 'device']);

// A tool whose effects reach outside nixie runs queued as an action, and every other tool runs
// direct, inside the turn.
export function hasQueuedEffect(effects: readonly Effect[]): boolean {
  return effects.some((effect) => queuedEffects.has(effect));
}
