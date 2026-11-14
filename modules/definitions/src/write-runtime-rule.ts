import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { renderRule, toStoredRuleForm } from '@heynixie/policy';
import type { ProposalContext } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import type { RuntimeRuleInput } from './build-runtime-rule-row';
import { buildRuntimeRuleRow } from './build-runtime-rule-row';
import { rulesRuntimeChangedCodec } from './rules-runtime-changed-codec';
import type { DefinitionsTables } from './types';
import { writeRuntimeRuleState } from './write-runtime-rule-state';

export interface RuleContext extends ProposalContext {
  readonly runInForceSeed: () => Promise<unknown>;
}

export async function writeRuntimeRule(
  context: RuleContext,
  input: RuntimeRuleInput,
): Promise<{ readonly changeID: string }> {
  const changeID = await withWriteTransaction(context.log.writer, (tx) =>
    writeRuntimeRuleInTransaction(tx, context, input),
  );

  await context.runInForceSeed();

  return { changeID };
}

// The caller owns the transaction and runs the in-force seed after it commits.
export async function writeRuntimeRuleInTransaction(
  tx: Transaction<unknown>,
  context: ProposalContext,
  input: RuntimeRuleInput,
): Promise<string> {
  const changeID = crypto.randomUUID();
  const at = context.clock.now();
  const tables = tx.$extendTables<DefinitionsTables>();

  const previous = await tables
    .selectFrom('runtime_rules')
    .select(['change_id', 'base_hash'])
    .where('rule_id', '=', input.ruleID)
    .where('state', '=', 'in_force')
    .executeTakeFirst();

  const definitions = await tables
    .selectFrom('definition_rules')
    .select('rule_hash')
    .where('rule_id', '=', input.ruleID)
    .executeTakeFirst();

  const write = buildRuntimeRuleRow({
    changeID,
    input,
    previous: previous ?? null,
    definitionsHash: definitions?.rule_hash ?? null,
    at,
  });

  if (write.stored !== null) {
    await tables
      .insertInto('rule_versions')
      .values({
        rule_hash: write.stored.hash,
        rule: JSON.stringify(toStoredRuleForm(write.stored.rule)),
      })
      .onConflict((conflict) => conflict.doNothing())
      .execute();
  }

  if (write.supersededID !== null) {
    await writeRuntimeRuleState(tx, { changeID: write.supersededID, to: 'superseded', at });
  }

  await tables.insertInto('runtime_rules').values(write.row).execute();

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: rulesRuntimeChangedCodec.kind,
      definitions: context.definitions(),
      payload: rulesRuntimeChangedCodec.encode({
        changeID,
        ruleID: input.ruleID,
        ruleHash: write.row.rule_hash,
        sentence: write.stored === null ? null : renderRule(write.stored.rule),
        changedBy: input.changedBy,
        reason: input.reason,
      }),
    },
  ]);

  return changeID;
}
