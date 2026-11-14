import type { ContractInputs } from '@heynixie/contract';
import type { SeenApproval } from './merge-seen-approvals';

type BatchAnswer = ContractInputs['approvals']['answerProposals']['answers'][number];

// The host takes this many answers in one call.
const answersPerCall = 100;

// A routine row that waits for an answer, which a batch approve may take. An always-ask, lifting,
// memory or deferred row never joins a batch.
export function isBatchable(entry: SeenApproval): boolean {
  const proposal = entry.item.proposal;

  return (
    entry.group === 'routine' &&
    proposal.state === 'pending' &&
    proposal.riskClass === 'routine' &&
    proposal.kind === 'action'
  );
}

// One approve answer for each batchable row, against the hash the digest first showed, in calls of
// at most the host's limit.
export function buildBatchAnswers(
  entries: readonly SeenApproval[],
  nextClientActionID: () => string,
): readonly (readonly BatchAnswer[])[] {
  const answers: BatchAnswer[] = entries
    .filter((entry) => isBatchable(entry))
    .map((entry) => ({
      proposalID: entry.proposalID,
      actionHash: entry.firstActionHash,
      choice: 'approve',
      clientActionID: nextClientActionID(),
    }));

  const calls: BatchAnswer[][] = [];

  for (let start = 0; start < answers.length; start += answersPerCall) {
    calls.push(answers.slice(start, start + answersPerCall));
  }

  return calls;
}
