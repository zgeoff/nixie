import type { ApprovalItem, ApprovalRead } from '../types';

type ApprovalGroup = ApprovalItem['group'];

export interface SeenApproval {
  readonly proposalID: string;
  readonly group: ApprovalGroup;

  // the row as the digest last listed it, or as it last read it
  readonly item: ApprovalRead;
}

export function toApprovalRead(item: ApprovalItem): ApprovalRead {
  return {
    proposal: item.proposal,
    body: item.body,
    task: item.task,
    chain: item.chain,
    choices: item.choices,
    passkeyChoices: item.passkeyChoices,
    answeredOn: null,
    isAnsweredHere: false,
    call: null,
  };
}

// The rows the digest has shown. A row that the list no longer holds stays, so the digest can
// read it again and collapse its line to its state. The current rows come first in their listed
// order, then the rows that left, in the order they were shown.
export function mergeSeenApprovals(
  seen: readonly SeenApproval[],
  listed: readonly ApprovalItem[],
): readonly SeenApproval[] {
  const listedIDs = new Set(listed.map((item) => item.proposal.proposalID));

  const current = listed.map((item) => ({
    proposalID: item.proposal.proposalID,
    group: item.group,
    item: toApprovalRead(item),
  }));

  return [...current, ...seen.filter((entry) => !listedIDs.has(entry.proposalID))];
}

// Takes the read of a row that left the list as that row's entry, with the body it showed before
// when the read has none.
export function applyApprovalReads(
  seen: readonly SeenApproval[],
  reads: readonly ApprovalRead[],
): readonly SeenApproval[] {
  const byID = new Map(reads.map((read) => [read.proposal.proposalID, read]));

  return seen.map((entry) => {
    const read = byID.get(entry.proposalID);

    if (read === undefined) {
      return entry;
    }

    // A closed row can lose its body, so the line keeps the text it showed while open.
    return { ...entry, item: { ...read, body: read.body ?? entry.item.body } };
  });
}
