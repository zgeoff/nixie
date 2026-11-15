import type { Rule } from '@heynixie/policy';
import { parseRule } from '@heynixie/policy';
import type { Kysely } from 'kysely';
import type { DefinitionsTables } from '../types';

export interface CurrentRuleVersion {
  readonly revision: number;
  readonly rule: Rule;
}

// The rule in force under an ID, or null when none is.
export async function readCurrentRule(
  db: Kysely<unknown>,
  ruleID: string,
): Promise<CurrentRuleVersion | null> {
  const row = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('rules')
    .innerJoin('rule_versions', 'rule_versions.rule_hash', 'rules.rule_hash')
    .select(['rules.revision', 'rule_versions.rule'])
    .where('rules.rule_id', '=', ruleID)
    .executeTakeFirst();

  return row === undefined
    ? null
    : { revision: row.revision, rule: parseRule(JSON.parse(row.rule)) };
}
