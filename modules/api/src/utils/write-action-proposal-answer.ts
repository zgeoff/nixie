import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { actionAnsweredCodec, actionProposalLapseMs, readActionProposals } from '@heynixie/policy';
import type { TasksContext, TasksTables } from '@heynixie/tasks';
import { isFinishedState, writeInboxRecordsInTransaction } from '@heynixie/tasks';

export type ActionProposalAnswer =
  | { readonly answer: 'approve'; readonly proposalID: string }
  | { readonly answer: 'reject'; readonly proposalID: string; readonly reason: string | null };

export type ActionProposalResult =
  | { readonly status: 'approved' | 'declined'; readonly proposalID: string }
  | {
      readonly status: 'refused';
      readonly code: 'NOT_FOUND' | 'PROPOSAL_CLOSED';
      readonly reason: string;
    };

// The answer lands in the task's inbox, so the task hears it. A task that has finished takes no
// input, so its answer is written with no thread and wakes nothing.
export function writeActionProposalAnswer(
  context: Pick<TasksContext, 'log' | 'clock' | 'definitions'>,
  request: ActionProposalAnswer,
): Promise<ActionProposalResult> {
  return withWriteTransaction(context.log.writer, async (tx): Promise<ActionProposalResult> => {
    const proposals = await readActionProposals(tx);

    const proposal = proposals.find((entry) => entry.shortID === request.proposalID);

    if (proposal === undefined) {
      return { status: 'refused', code: 'NOT_FOUND', reason: 'nothing has that ID' };
    }

    if (
      proposal.outcome !== null ||
      proposal.proposedAt + actionProposalLapseMs <= context.clock.now()
    ) {
      return {
        status: 'refused',
        code: 'PROPOSAL_CLOSED',
        reason: 'the proposal is answered or lapsed',
      };
    }

    const task =
      proposal.thread === null
        ? undefined
        : await tx
            .$extendTables<TasksTables>()
            .selectFrom('tasks')
            .select('state')
            .where('task_id', '=', proposal.thread)
            .executeTakeFirst();

    const isOpen = task !== undefined && !isFinishedState(task.state);
    const isApproved = request.answer === 'approve';
    const reason = request.answer === 'reject' ? request.reason : null;

    const input = {
      kind: actionAnsweredCodec.kind,
      definitions: context.definitions(),
      ...(isOpen && proposal.thread !== null ? { thread: proposal.thread } : {}),
      parent: proposal.callSequence,
      payload: actionAnsweredCodec.encode({
        proposalID: proposal.proposalID,
        shortID: proposal.shortID,
        answer: isApproved ? 'approved' : 'declined',
      }),
      ...(reason === null ? {} : { erasable: { reason } }),
    };

    await (isOpen
      ? writeInboxRecordsInTransaction(tx, context, [input])
      : writeRecordsInTransaction(tx, context.log, [input]));

    return { status: isApproved ? 'approved' : 'declined', proposalID: request.proposalID };
  });
}
