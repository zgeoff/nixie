import type { EffectDeclaration, PlaceRef, RuleEntry } from '@heynixie/policy';
import { effectNames, trustLevels } from '@heynixie/policy';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import { readSnapshotRules } from '../rule/read-rules-in-force';
import type { DefinitionsTables } from '../types';

export interface SnapshotPolicyRead {
  readonly rules: readonly RuleEntry[];
  readonly tools: ReadonlyMap<string, EffectDeclaration>;

  // each place of the snapshot's directory; an older snapshot's contacts read as places at known
  readonly places: readonly PlaceRef[];
}

const declarationSchema = z.object({
  name: z.string(),
  effects: z.enum(effectNames).array(),
  destinations: z.string().array(),
  amount: z.string().nullable(),
  content: z.string().array(),
  results: z.record(z.string(), z.enum(['owner', 'owner_data', 'untrusted'])),
  requiresDestination: z.literal(true).exactOptional(),
});

const placeRefSchema = z.object({
  placeID: z.string(),
  trust: z.enum(trustLevels),
  nameSequence: z.int().exactOptional(),
});

const formSchema = z.object({
  policy: z.object({
    tools: declarationSchema.array(),
    contacts: z.string().array().default([]),
    places: placeRefSchema.array().default([]),
  }),
});

// A call runs under the snapshot it started with, so the reads name the snapshot, never the latest.
export async function readSnapshotPolicy(
  db: Kysely<unknown>,
  snapshotHash: string,
): Promise<SnapshotPolicyRead> {
  const row = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('definition_snapshots')
    .select('form')
    .where('snapshot_hash', '=', snapshotHash)
    .executeTakeFirst();

  if (row === undefined) {
    return { rules: [], tools: new Map(), places: [] };
  }

  const form = formSchema.parse(JSON.parse(row.form));

  const entries = await readSnapshotRules(db, snapshotHash);

  return {
    rules: entries.map((entry) => ({
      id: entry.ruleID,
      revision: entry.revision,
      rule: entry.rule.rule,
    })),
    tools: new Map(form.policy.tools.map((tool) => [tool.name, toDeclaration(tool)])),
    places: [...form.policy.places, ...form.policy.contacts.map(toKnownPlace)],
  };
}

function toDeclaration(tool: z.output<typeof declarationSchema>): EffectDeclaration {
  return {
    effects: tool.effects,
    destinations: tool.destinations,
    amount: tool.amount,
    content: tool.content,
    results: tool.results,
    ...(tool.requiresDestination === true ? { requiresDestination: true as const } : {}),
  };
}

// an older snapshot's contact IDs are places at known
function toKnownPlace(contactID: string): PlaceRef {
  return { placeID: contactID, trust: 'known' };
}
