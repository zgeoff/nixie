import type { EffectOverride, PlacesSeedPlan } from '@heynixie/policy';
import { applyPlacesSeedPlan, readPlaceRefs } from '@heynixie/policy';
import type { Transaction } from 'kysely';
import { addSeededRules } from '../rule/add-seeded-rules';
import type { RuleInForce, SnapshotPolicy } from '../types';
import { pickSeedEffects } from '../utils/pick-seed-effects';

export interface SeedPolicyInput {
  readonly base: SnapshotPolicy;
  readonly overrides: ReadonlyMap<string, EffectOverride>;
  readonly rules: readonly RuleInForce[];

  // the sites that the seed adds to the directory and the ones it removes
  readonly places: PlacesSeedPlan;

  // the references of the accounts that are you, each a place at self in the snapshot
  readonly selfPlaces: readonly string[];
}

// Reads the reference of each account that is you, in the seed's transaction. A reference is an
// opaque ID that holds no address, so the snapshot stays free of one and a call resolves it, through
// the account's own erasable record, when it decides.
export type SelfPlacesReader = (tx: Transaction<unknown>) => Promise<readonly string[]>;

export type SeedPolicy =
  | { readonly status: 'built'; readonly policy: SnapshotPolicy }
  | { readonly status: 'refused'; readonly error: Error };

// The policy of a seed: the tools in code with the effect overrides applied, each rule in force and
// each place of the directory.
export async function readSeedPolicy(
  tx: Transaction<unknown>,
  input: SeedPolicyInput,
): Promise<SeedPolicy> {
  const effects = pickSeedEffects({ tools: input.base.tools, overrides: input.overrides });

  if (effects.status === 'refused') {
    return { status: 'refused', error: new Error(effects.reason) };
  }

  const refs = await readPlaceRefs(tx);

  const places = [
    ...applyPlacesSeedPlan(refs, input.places),
    ...input.selfPlaces.toSorted().map((placeID) => ({ placeID, trust: 'self' as const })),
  ];

  return {
    status: 'built',
    policy: addSeededRules({ ...input.base, tools: effects.tools }, input.rules, places),
  };
}
