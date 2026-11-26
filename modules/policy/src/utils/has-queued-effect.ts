import type { Effect } from '../types';

const queuedEffects: ReadonlySet<Effect> = new Set([
  'write',
  'delete',
  'send',
  'spend',
  'device',
  'computer_run',
  'install_package',
]);

// A tool whose effects reach outside nixie, or remove its own records for good, runs queued as an action, and every other tool runs
// direct, inside the turn.
export function hasQueuedEffect(effects: readonly Effect[]): boolean {
  return effects.some((effect) => queuedEffects.has(effect));
}
