import { parseRule } from '@heynixie/policy';
import type { Kysely } from 'kysely';
import { readDefinitionsInForce } from './read-definitions-in-force';
import type { DefinitionsTables, RuleInForce } from './types';

export interface RuleInForceEntry extends RuleInForce {
  readonly lastFiredAt: number | null;
}

export async function readRulesInForce(db: Kysely<unknown>): Promise<readonly RuleInForceEntry[]> {
  const inForce = await readDefinitionsInForce(db);

  return inForce === null ? [] : readSnapshotRules(db, inForce.snapshotHash);
}

export async function readSnapshotRules(
  db: Kysely<unknown>,
  snapshotHash: string,
): Promise<readonly RuleInForceEntry[]> {
  const rows = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('snapshot_rules')
    .innerJoin('rule_versions', 'rule_versions.rule_hash', 'snapshot_rules.rule_hash')
    .innerJoin('rules', 'rules.rule_id', 'snapshot_rules.rule_id')
    .leftJoin('rule_fires', 'rule_fires.rule_id', 'snapshot_rules.rule_id')
    .select([
      'snapshot_rules.rule_id',
      'snapshot_rules.revision',
      'snapshot_rules.rule_hash',
      'snapshot_rules.change_id',
      'rule_versions.rule',
      'rules.origin',
      'rule_fires.last_fired_at',
    ])
    .where('snapshot_rules.snapshot_hash', '=', snapshotHash)
    .orderBy('snapshot_rules.rule_id')
    .execute();

  return rows.map((row) => ({
    ruleID: row.rule_id,
    revision: row.revision,
    rule: { hash: row.rule_hash, rule: parseRule(JSON.parse(row.rule)) },
    origin: row.origin,
    changeID: row.change_id,
    lastFiredAt: row.last_fired_at,
  }));
}
