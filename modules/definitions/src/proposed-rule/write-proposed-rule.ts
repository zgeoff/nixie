import { writeRecordsInTransaction } from '@heynixie/log';
import type { Rule } from '@heynixie/policy';
import type { ProposalConfig, ProposalContext } from '@heynixie/proposals';
import { buildProposeDeps, proposeInTransaction } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import { describeProposedRule, toRuleBodyForm } from './describe-proposed-rule';
import { ruleProposedCodec } from './rule-proposed-codec';

export interface ProposedRuleWrite {
  readonly groupHash: string;
  readonly rule: Omit<Rule, 'id'>;

  // the UUIDs of the action proposals the rule covers
  readonly approvals: readonly string[];
  readonly editOf: string | null;
}

const dayMs = 24 * 60 * 60 * 1000;

// The rule waits in erasable fields, so a rule you turn down leaves no address in a plain column.
export async function writeProposedRule(
  tx: Transaction<unknown>,
  context: ProposalContext & { readonly proposalConfig?: ProposalConfig | undefined },
  write: ProposedRuleWrite,
): Promise<{ readonly proposalID: string; readonly shortID: string }> {
  const facts = describeProposedRule(write.rule);
  const deps = buildProposeDeps({ ...context, config: context.proposalConfig });

  const proposed = await proposeInTransaction(deps, tx, {
    family: 'rule_change',
    kind: 'internal_change',
    cause: 'proposed_rule',
    riskClass: facts.riskClass,
    actionHash: facts.actionHash,
    ruleHash: null,
    thread: null,
    taskID: null,
    deadlineAt: null,
    sameThing: null,
    intervalMs: deps.config.lapseDays.rule_change * dayMs,
  });

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: ruleProposedCodec.kind,
      definitions: context.definitions(),
      payload: ruleProposedCodec.encode({
        proposalID: proposed.proposalID,
        shortID: proposed.shortID,
        groupHash: write.groupHash,
        ruleHash: facts.ruleHash,
        actionHash: facts.actionHash,
        riskClass: facts.riskClass,
        approvals: [...write.approvals],
        editOf: write.editOf,
      }),
      erasable: { rule: toRuleBodyForm(write.rule) },
    },
  ]);

  return { proposalID: proposed.proposalID, shortID: proposed.shortID };
}
