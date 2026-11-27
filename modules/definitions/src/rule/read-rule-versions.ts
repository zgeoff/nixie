import type { Rule } from '@heynixie/policy';
import { parseRule } from '@heynixie/policy';
import type { Kysely } from 'kysely';
import type { DefinitionsTables } from '../types';

// The stored rule of each hash, for the hashes that exist.
export async function readRuleVersions(
  db: Kysely<unknown>,
  hashes: readonly string[],
): Promise<ReadonlyMap<string, Rule>> {
  if (hashes.length === 0) {
    return new Map();
  }

  const rows = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('rule_versions')
    .select(['rule_hash', 'rule'])
    .where('rule_hash', 'in', [...hashes])
    .execute();

  return new Map(rows.map((row) => [row.rule_hash, parseRule(JSON.parse(row.rule))]));
}
