interface StateFacts {
  readonly proposal: { readonly state: string; readonly deferUntil: Date | null };
  readonly answeredOn: string | null;
  readonly isAnsweredHere: boolean;
}

const closedStates: Readonly<Record<string, string>> = {
  approved: 'Approved',
  declined: 'Declined',
  lapsed: 'Lapsed',
  withdrawn: 'Withdrawn',
};

// The state a card shows from its row's records: a closed row by its outcome, a deferred row with
// its return time, and an open row not at all.
export function formatApprovalState(item: StateFacts): string | null {
  const proposal = item.proposal;

  if (proposal.state === 'pending') {
    return null;
  }

  if (proposal.state === 'deferred') {
    return proposal.deferUntil === null
      ? 'Deferred'
      : `Deferred until ${proposal.deferUntil.toLocaleString()}`;
  }

  const outcome = closedStates[proposal.state] ?? proposal.state;

  return item.answeredOn !== null && !item.isAnsweredHere
    ? `${outcome} on ${item.answeredOn}`
    : outcome;
}
