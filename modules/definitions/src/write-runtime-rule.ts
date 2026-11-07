import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Rule } from '@heynixie/policy';
import { renderRule, toRuleForm } from '@heynixie/policy';
import type { ProposalContext } from '@heynixie/proposals';
import { buildRuleHash } from './build-rule-hash';
import { rulesRuntimeChangedCodec } from './rules-runtime-changed-codec';
import type { DefinitionsTables, RuleChanger } from './types';
import { writeRuntimeRuleState } from './write-runtime-rule-state';

export interface RuleContext extends ProposalContext {
  readonly runInForceSeed: () => Promise<unknown>;
}

export interface RuntimeRuleInput {
  readonly ruleID: string;
  readonly rule: Omit<Rule, 'id'> | null;
  readonly changedBy: RuleChanger;
  readonly reason: string;
}

export async function writeRuntimeRule(
  context: RuleContext,
  input: RuntimeRuleInput,
): Promise<{ readonly changeID: string }> {
  const changeID = crypto.randomUUID();

  await withWriteTransaction(context.log.writer, async (tx) => {
    const at = context.clock.now();
    const tables = tx.$extendTables<DefinitionsTables>();
    const form = input.rule === null ? null : toRuleForm({ ...input.rule, id: input.ruleID });
    const stored = form === null ? null : { rule: form, hash: buildRuleHash(form) };
    const hash = stored?.hash ?? null;

    if (stored !== null) {
      await tables
        .insertInto('rule_versions')
        .values({ rule_hash: stored.hash, rule: JSON.stringify(stored.rule) })
        .onConflict((conflict) => conflict.doNothing())
        .execute();
    }

    const previous = await tables
      .selectFrom('runtime_rules')
      .select(['change_id', 'base_hash'])
      .where('rule_id', '=', input.ruleID)
      .where('state', '=', 'in_force')
      .executeTakeFirst();

    if (previous !== undefined) {
      await writeRuntimeRuleState(tx, { changeID: previous.change_id, to: 'superseded', at });
    }

    const definitions = await tables
      .selectFrom('definition_rules')
      .select('rule_hash')
      .where('rule_id', '=', input.ruleID)
      .executeTakeFirst();

    const definitionsHash = definitions?.rule_hash ?? null;

    await tables
      .insertInto('runtime_rules')
      .values({
        change_id: changeID,
        rule_id: input.ruleID,
        rule_hash: hash,
        state: 'in_force',
        base_hash: previous === undefined ? definitionsHash : previous.base_hash,
        definitions_hash: definitionsHash,
        changed_by: input.changedBy,
        reason: input.reason,
        changed_at: at,
        updated_at: at,
      })
      .execute();

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: rulesRuntimeChangedCodec.kind,
        definitions: context.definitions(),
        payload: rulesRuntimeChangedCodec.encode({
          changeID,
          ruleID: input.ruleID,
          ruleHash: hash,
          sentence: stored === null ? null : renderRule(stored.rule),
          changedBy: input.changedBy,
          reason: input.reason,
        }),
      },
    ]);
  });

  await context.runInForceSeed();

  return { changeID };
}
