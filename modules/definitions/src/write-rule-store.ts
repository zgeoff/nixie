import type { Transaction } from 'kysely';
import type { PlannedRule, RuleSeedPlan } from './build-rule-seed-plan';
import type { CurrentRule } from './read-rule-store';
import type {
  DefinitionRule,
  DefinitionsTables,
  RuleInForce,
  RuleOrigin,
  StoredRule,
} from './types';
import { writeRuntimeRuleState } from './write-runtime-rule-state';

export interface RuleStoreWrite {
  readonly plan: RuleSeedPlan;

  readonly definitions: readonly DefinitionRule[] | null;
  readonly current: ReadonlyMap<string, CurrentRule>;
  readonly at: number;
}

export interface RuleRevision {
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

  const planned = new Map(write.plan.inForce.map((entry) => [entry.rule.rule.id, entry]));

  const ruleIDs = [...new Set([...write.current.keys(), ...planned.keys()])].toSorted();
  const inForce: RuleInForce[] = [];
  const revisions: RuleRevision[] = [];

  for (const ruleID of ruleIDs) {
    const entry = planned.get(ruleID) ?? null;
    const current = write.current.get(ruleID) ?? null;
    const hash = entry?.rule.hash ?? null;
    const origin = pickRuleOrigin(entry, current);
    const isChanged = (current?.hash ?? null) !== hash;
    const revision = isChanged ? (current?.revision ?? 0) + 1 : (current?.revision ?? 0);

    if (current === null) {
      await tables
        .insertInto('rules')
        .values({
          rule_id: ruleID,
          revision,
          rule_hash: hash,
          origin,
          created_at: write.at,
          updated_at: write.at,
        })
        .execute();
    } else if (isChanged || current.origin !== origin) {
      await tables
        .updateTable('rules')
        .set({ revision, rule_hash: hash, origin, updated_at: write.at })
        .where('rule_id', '=', ruleID)
        .execute();
    }

    if (isChanged) {
      await tables
        .insertInto('rule_revisions')
        .values({ rule_id: ruleID, revision, rule_hash: hash, created_at: write.at })
        .execute();

      revisions.push({ ruleID, revision, hash });
    }

    if (entry !== null) {
      inForce.push({ ruleID, revision, rule: entry.rule, origin, changeID: entry.changeID });
    }
  }

  return { inForce, revisions };
}

function pickRuleOrigin(entry: PlannedRule | null, current: CurrentRule | null): RuleOrigin {
  if (entry === null) {
    return current?.origin ?? 'definitions';
  }

  return entry.changeID === null ? 'definitions' : 'nixie';
}
