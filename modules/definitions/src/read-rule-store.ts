import { parseRule } from '@heynixie/policy';
import type { Kysely } from 'kysely';
import invariant from 'tiny-invariant';
import type {
  DefinitionRule,
  DefinitionsTables,
  RuleOrigin,
  RuntimeRule,
  StoredRule,
} from './types';

export interface CurrentRule {
  readonly revision: number;
  readonly hash: string | null;
  readonly origin: RuleOrigin;
}

export interface RuleStore {
  readonly definitions: readonly DefinitionRule[];
  readonly seeded: readonly StoredRule[];
  readonly runtime: readonly RuntimeRule[];
  readonly current: ReadonlyMap<string, CurrentRule>;
}

export async function readRuleStore(db: Kysely<unknown>): Promise<RuleStore> {
  const tables = db.$extendTables<DefinitionsTables>();

  const versions = await readRuleVersions(db);

  const definitions = await tables
    .selectFrom('definition_rules')
    .select(['rule_hash', 'path'])
    .orderBy('rule_id')
    .execute();

  const seeded = await tables
    .selectFrom('seeded_rules')
    .select('rule_hash')
    .orderBy('rule_id')
    .execute();

  const runtime = await tables
    .selectFrom('runtime_rules')
    .selectAll()
    .where('state', '=', 'in_force')
    .orderBy('rule_id')
    .execute();

  const current = await tables
    .selectFrom('rules')
    .select(['rule_id', 'revision', 'rule_hash', 'origin'])
    .execute();

  const get = (hash: string): StoredRule => {
    const stored = versions.get(hash);

    invariant(stored, `the rule version ${hash} is missing, though a foreign key holds it`);

    return stored;
  };

  const find = (hash: string | null): StoredRule | null => (hash === null ? null : get(hash));

  return {
    definitions: definitions.map((row) => {
      const stored = get(row.rule_hash);

      return { hash: stored.hash, rule: stored.rule, path: row.path };
    }),
    seeded: seeded.map((row) => get(row.rule_hash)),
    runtime: runtime.map((row) => ({
      changeID: row.change_id,
      ruleID: row.rule_id,
      rule: find(row.rule_hash),
      base: find(row.base_hash),
      beneath: find(row.definitions_hash),
      changedBy: row.changed_by,
      reason: row.reason,
      changedAt: row.changed_at,
    })),
    current: new Map(
      current.map((row) => [
        row.rule_id,
        { revision: row.revision, hash: row.rule_hash, origin: row.origin },
      ]),
    ),
  };
}

async function readRuleVersions(db: Kysely<unknown>): Promise<ReadonlyMap<string, StoredRule>> {
  const rows = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('rule_versions')
    .select(['rule_hash', 'rule'])
    .execute();

  return new Map(
    rows.map((row) => [
      row.rule_hash,
      { hash: row.rule_hash, rule: parseRule(JSON.parse(row.rule)) },
    ]),
  );
}
