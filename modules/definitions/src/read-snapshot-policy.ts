import type { EffectDeclaration, RuleEntry } from '@heynixie/policy';
import { effectNames } from '@heynixie/policy';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import { readSnapshotRules } from './read-rules-in-force';
import type { DefinitionsTables } from './types';

export interface SnapshotPolicyRead {
  readonly rules: readonly RuleEntry[];
  readonly tools: ReadonlyMap<string, EffectDeclaration>;
  readonly contactIDs: readonly string[];
}

const declarationSchema = z.object({
  name: z.string(),
  effects: z.enum(effectNames).array(),
  destinations: z.string().array(),
  amount: z.string().nullable(),
  content: z.string().array(),
  results: z.record(z.string(), z.enum(['owner', 'owner_data', 'untrusted'])),
});

const formSchema = z.object({
  policy: z.object({
    tools: declarationSchema.array(),
    contacts: z.string().array().default([]),
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
    return { rules: [], tools: new Map(), contactIDs: [] };
  }

  const form = formSchema.parse(JSON.parse(row.form));

  const entries = await readSnapshotRules(db, snapshotHash);

  return {
    rules: entries.map((entry) => ({
      id: entry.ruleID,
      revision: entry.revision,
      rule: entry.rule.rule,
    })),
    tools: new Map(
      form.policy.tools.map((tool) => [
        tool.name,
        {
          effects: tool.effects,
          destinations: tool.destinations,
          amount: tool.amount,
          content: tool.content,
          results: tool.results,
        },
      ]),
    ),
    contactIDs: form.policy.contacts,
  };
}
