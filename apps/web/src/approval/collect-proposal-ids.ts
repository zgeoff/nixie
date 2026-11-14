import type { LiveRecord } from '../conversation/use-live-records';

// One read serves at most this many cards, the host's limit for a read of proposals.
const readLimit = 100;

// The proposals that the records on screen created, newest last. A thread that shows more than
// the limit reads the newest ones.
export function collectProposalIDs(records: readonly LiveRecord[]): readonly string[] {
  const ids = records.flatMap((record) =>
    record.proposal === undefined ? [] : [record.proposal.proposalID],
  );

  return [...new Set(ids)].slice(-readLimit);
}
