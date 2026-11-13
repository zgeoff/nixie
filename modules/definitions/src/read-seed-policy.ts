import { readKnownContactIDs } from '@heynixie/policy';
import type { EffectOverride } from '@heynixie/policy';
import type { Transaction } from 'kysely';
import { addSeededRules } from './add-seeded-rules';
import type { HeldEffects } from './pick-seed-effects';
import { pickSeedEffects } from './pick-seed-effects';
import { readApprovedEffectRemovals } from './read-approved-effect-removals';
import { readSnapshotToolEffects } from './read-snapshot-tool-effects';
import type { DefinitionsInForce, RuleInForce, SnapshotPolicy } from './types';

export interface SeedPolicyInput {
  readonly base: SnapshotPolicy;
  readonly overrides: ReadonlyMap<string, EffectOverride>;
  readonly inForce: DefinitionsInForce | null;
  readonly rules: readonly RuleInForce[];
}

export type SeedPolicy =
  | {
      readonly status: 'built';
      readonly policy: SnapshotPolicy;
      readonly held: readonly HeldEffects[];
    }
  | { readonly status: 'refused'; readonly error: Error };

// The policy of a seed: the tools in code with the effect overrides applied, each rule in force and
// each known contact. An effect that leaves a tool stays until you approve it.
export async function readSeedPolicy(
  tx: Transaction<unknown>,
  input: SeedPolicyInput,
): Promise<SeedPolicy> {
  const previous =
    input.inForce === null ? null : await readSnapshotToolEffects(tx, input.inForce.snapshotHash);

  const effects = pickSeedEffects({
    tools: input.base.tools,
    overrides: input.overrides,
    inForce: previous,
    approved: await readApprovedEffectRemovals(tx),
  });

  if (effects.status === 'refused') {
    return { status: 'refused', error: new Error(effects.reason) };
  }

  const contacts = await readKnownContactIDs(tx);

  return {
    status: 'built',
    policy: addSeededRules({ ...input.base, tools: effects.tools }, input.rules, contacts),
    held: effects.held,
  };
}
