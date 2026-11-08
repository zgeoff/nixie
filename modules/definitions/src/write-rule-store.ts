import type { Transaction } from 'kysely';
import type { RuleRevisions } from './build-rule-revisions';
import type { RuleSeedPlan } from './build-rule-seed-plan';
import type { DefinitionRule, DefinitionsTables, RuleInForce, StoredRule } from './types';
import { writeRuntimeRuleState } from './write-runtime-rule-state';

export interface RuleStoreWrite {
  readonly plan: RuleSeedPlan;

  readonly definitions: readonly DefinitionRule[] | null;
  readonly revisions: RuleRevisions;
  readonly at: number;
}

interface RuleRevision {
  readonly ruleID: string;
  readonly revision: number;
  readonly hash: string | null;
}

export interface WrittenRules {
  readonly inForce: readonly RuleInForce[];
  readonly revisions: readonly RuleRevision[];
}

export async function writeRuleStore(
  tx: Transaction<unknown>,
  write: RuleStoreWrite,
): Promise<WrittenRules> {
  const plan = write.plan;

  await writeRuleVersions(tx, [
    ...(write.definitions ?? []),
    ...plan.seeded,
    ...plan.inForce.map((entry) => entry.rule),
  ]);

  if (write.definitions !== null) {
    await writeDefinitionRules(tx, write.definitions);
  }

  await writeSeededRules(tx, plan.seeded);

  for (const change of plan.adopted) {
    await writeRuntimeRuleState(tx, { changeID: change.changeID, to: 'adopted', at: write.at });
  }

  for (const overlaid of plan.overlaid) {
    await tx
      .$extendTables<DefinitionsTables>()
      .updateTable('runtime_rules')
      .set({ definitions_hash: overlaid.beneath?.hash ?? null, updated_at: write.at })
      .where('change_id', '=', overlaid.change.changeID)
      .execute();
  }

  return writeRuleRevisions(tx, write);
}

async function writeRuleVersions(
  tx: Transaction<unknown>,
  rules: readonly StoredRule[],
): Promise<void> {
  const unique = new Map(rules.map((rule) => [rule.hash, rule]));

  if (unique.size === 0) {
    return;
  }

  await tx
    .$extendTables<DefinitionsTables>()
    .insertInto('rule_versions')
    .values(
      [...unique.values()].map((rule) => ({
        rule_hash: rule.hash,
        rule: JSON.stringify(rule.rule),
      })),
    )
    .onConflict((conflict) => conflict.doNothing())
    .execute();
}

async function writeDefinitionRules(
  tx: Transaction<unknown>,
  definitions: readonly DefinitionRule[],
): Promise<void> {
  const tables = tx.$extendTables<DefinitionsTables>();

  await tables.deleteFrom('definition_rules').execute();

  if (definitions.length > 0) {
    await tables
      .insertInto('definition_rules')
      .values(
        definitions.map((rule) => ({
          rule_id: rule.rule.id,
          rule_hash: rule.hash,
          path: rule.path,
        })),
      )
      .execute();
  }
}

async function writeSeededRules(
  tx: Transaction<unknown>,
  seeded: readonly StoredRule[],
): Promise<void> {
  const tables = tx.$extendTables<DefinitionsTables>();

  await tables.deleteFrom('seeded_rules').execute();

  if (seeded.length > 0) {
    await tables
      .insertInto('seeded_rules')
      .values(seeded.map((rule) => ({ rule_id: rule.rule.id, rule_hash: rule.hash })))
      .execute();
  }
}

async function writeRuleRevisions(
  tx: Transaction<unknown>,
  write: RuleStoreWrite,
): Promise<WrittenRules> {
  const tables = tx.$extendTables<DefinitionsTables>();
  const revisions: RuleRevision[] = [];

  for (const entry of write.revisions.entries) {
    const row = {
      revision: entry.revision,
      rule_hash: entry.hash,
      origin: entry.origin,
      updated_at: write.at,
    };

    if (entry.current === null) {
      await tables
        .insertInto('rules')
        .values({ ...row, rule_id: entry.ruleID, created_at: write.at })
        .execute();
    } else if (entry.isChanged || entry.current.origin !== entry.origin) {
      await tables.updateTable('rules').set(row).where('rule_id', '=', entry.ruleID).execute();
    }

    if (entry.isChanged) {
      await tables
        .insertInto('rule_revisions')
        .values({
          rule_id: entry.ruleID,
          revision: entry.revision,
          rule_hash: entry.hash,
          created_at: write.at,
        })
        .execute();

      revisions.push({ ruleID: entry.ruleID, revision: entry.revision, hash: entry.hash });
    }
  }

  return { inForce: write.revisions.inForce, revisions };
}
