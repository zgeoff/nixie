import { readKnownContactIDs } from '@heynixie/policy';
import type { EffectOverride } from '@heynixie/policy';
import type { Transaction } from 'kysely';
import { addSeededRules } from '../rule/add-seeded-rules';
import type { RuleInForce, SnapshotPolicy } from '../types';
import { pickSeedEffects } from '../utils/pick-seed-effects';

export interface SeedPolicyInput {
  readonly base: SnapshotPolicy;
  readonly overrides: ReadonlyMap<string, EffectOverride>;
  readonly rules: readonly RuleInForce[];
}

export type SeedPolicy =
  | { readonly status: 'built'; readonly policy: SnapshotPolicy }
  | { readonly status: 'refused'; readonly error: Error };

// The policy of a seed: the tools in code with the effect overrides applied, each rule in force and
// each known contact.
export async function readSeedPolicy(
  tx: Transaction<unknown>,
  input: SeedPolicyInput,
): Promise<SeedPolicy> {
  const effects = pickSeedEffects({ tools: input.base.tools, overrides: input.overrides });

  if (effects.status === 'refused') {
    return { status: 'refused', error: new Error(effects.reason) };
  }

  const contacts = await readKnownContactIDs(tx);

  return {
    status: 'built',
    policy: addSeededRules({ ...input.base, tools: effects.tools }, input.rules, contacts),
  };
}
