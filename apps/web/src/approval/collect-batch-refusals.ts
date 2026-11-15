import type { ContractOutputs } from '@heynixie/contract';
import type { SeenApproval } from './merge-seen-approvals';

type BatchResult = ContractOutputs['approvals']['answerProposals']['results'][number];

const refusalWords: Readonly<Record<string, string>> = {
  CONFLICT: 'changed after you opened it, so open it and check it',
  CLOSED: 'was answered, withdrawn or lapsed already',
  NOT_ALLOWED: 'does not take this answer',
  PASSKEY_REQUIRED: 'needs your passkey, so open it and approve it there',
};

// One line for each answer of a batch that the host refused, so nothing fails without a word.
export function collectBatchRefusals(
  results: readonly BatchResult[],
  entries: readonly SeenApproval[],
): readonly string[] {
  const sentences = new Map(
    entries.map((entry) => [entry.proposalID, entry.item.body?.sentence ?? entry.proposalID]),
  );

  return results.flatMap((result) => {
    if (!('error' in result)) {
      return [];
    }

    const sentence = sentences.get(result.proposalID) ?? result.proposalID;

    return [`${sentence} ${refusalWords[result.error] ?? 'was refused'}.`];
  });
}
