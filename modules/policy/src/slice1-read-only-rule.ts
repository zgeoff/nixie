import type { Effect, FixedRule } from './types';

const readOnlyEffects: ReadonlySet<Effect> = new Set(['read', 'fetch', 'note']);

// Slice 1's one rule, in place of the deny, ask and allow stages: a call whose effects are only
// read, fetch or note runs, and every other call is denied.
export const slice1ReadOnlyRule: FixedRule = {
  id: 'slice1.read-only',
  revision: 1,
  sentence:
    'Only a tool whose effects are read, fetch or note may run; every other call is denied.',
  pickOutcome: (_call, declaration) =>
    declaration.effects.every((effect) => readOnlyEffects.has(effect)) ? 'allow' : 'deny',
};
