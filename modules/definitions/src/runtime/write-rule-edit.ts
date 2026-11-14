import type { ProposalContext } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import type { RuleEditPick, RuleEditRequest } from './pick-rule-edit';
import { pickRuleEdit } from './pick-rule-edit';
import { readCurrentRule } from './read-current-rule';
import { writeRuntimeRuleInTransaction } from './write-runtime-rule';

export type RuleEditOutcome =
  | Exclude<RuleEditPick, { readonly status: 'write' }>
  | {
      readonly status: 'written';
    };

interface RuleEdit {
  readonly ruleID: string;
  readonly request: RuleEditRequest;
}

// The caller owns the transaction and runs the in-force seed after it commits.
export async function writeRuleEdit(
  tx: Transaction<unknown>,
  context: ProposalContext,
  edit: RuleEdit,
): Promise<RuleEditOutcome> {
  const current = await readCurrentRule(tx, edit.ruleID);

  const pick = pickRuleEdit(current, edit.request);

  if (pick.status !== 'write') {
    return pick;
  }

  await writeRuntimeRuleInTransaction(tx, context, {
    ruleID: edit.ruleID,
    rule: pick.rule,
    changedBy: 'owner',
    reason: pick.reason,
  });

  return { status: 'written' };
}
