import type { LiveRecord } from '../conversation/use-live-records';

// The proposals that the records on screen created, newest last.
export function collectProposalIDs(records: readonly LiveRecord[]): readonly string[] {
  const ids = records.flatMap((record) =>
    record.proposal === undefined ? [] : [record.proposal.proposalID],
  );

  return [...new Set(ids)];
}
