import { writeRecordsInTransaction } from '@heynixie/log';
import { writeActionProposal } from '@heynixie/policy';
import type { ProposalConfig } from '@heynixie/proposals';
import type { TasksContext } from '@heynixie/tasks';
import type { Transaction } from 'kysely';
import { creditFailedActions } from './credit-failed-actions';
import type { Attempt } from './leased-records';
import { buildOutcomeRecord } from './leased-records';
import type { AttemptStep } from './pick-attempt-step';

export interface RefusalRequest {
  readonly attempt: Pick<Attempt, 'action' | 'attempt'>;
  readonly step: Exclude<AttemptStep, { readonly kind: 'go' }>;
  readonly proposalConfig: ProposalConfig | undefined;
}

// Writes what an attempt that the policy check stopped leaves: a deny fails the action, and an ask
// holds it behind the shared proposal that opens the owner's question. The ask takes the lapse that
// the config sets for actions. Returns the sequences of the records it wrote through the log.
export async function writeRefusalInTransaction(
  tx: Transaction<unknown>,
  context: TasksContext,
  request: RefusalRequest,
): Promise<readonly number[]> {
  if (request.step.kind === 'deny') {
    const records = [
      buildOutcomeRecord(context, request.attempt, {
        outcome: { status: 'failed', reason: 'rule_denied' },
        details: { message: request.step.verdict.message },
        rule: request.step.verdict.rule,
      }),
    ];

    const written = await writeRecordsInTransaction(tx, context.log, records);

    await creditFailedActions(tx, context.budgets, records);

    return written.map((record) => record.sequence);
  }

  await writeActionProposal(
    tx,
    {
      log: context.log,
      clock: context.clock,
      definitions: context.definitions,
      proposalConfig: request.proposalConfig,
    },
    request.step.verdict.proposal,
  );

  const held = await writeRecordsInTransaction(tx, context.log, [
    {
      kind: 'action.held',
      definitions: context.definitions(),
      thread: request.attempt.action.task_id,
      payload: {
        actionID: request.attempt.action.action_id,
        proposalID: request.step.verdict.proposalID,
        ...request.step.verdict.version,
      },
    },
  ]);

  return held.map((record) => record.sequence);
}
