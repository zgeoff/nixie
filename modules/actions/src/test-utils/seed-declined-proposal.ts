import { writeRecords } from '@heynixie/log';
import { actionAnsweredCodec, readActionProposals } from '@heynixie/policy';
import type { TasksContext } from '@heynixie/tasks';
import invariant from 'tiny-invariant';

// Records the owner's decline of the action proposal with this short ID, as the proposal's own
// answer record does.
export async function seedDeclinedProposal(context: TasksContext, shortID: string): Promise<void> {
  const proposals = await readActionProposals(context.log.writer.db);

  const proposal = proposals.find((candidate) => candidate.shortID === shortID);

  invariant(proposal, `no action proposal has the short ID ${shortID}`);

  await writeRecords(context.log, [
    {
      kind: actionAnsweredCodec.kind,
      definitions: context.definitions(),
      ...(proposal.thread === null ? {} : { thread: proposal.thread }),
      parent: proposal.callSequence,
      payload: actionAnsweredCodec.encode({
        proposalID: proposal.proposalID,
        shortID,
        answer: 'declined',
        choice: 'decline',
      }),
    },
  ]);
}
