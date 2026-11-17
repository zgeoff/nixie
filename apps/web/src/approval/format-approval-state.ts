import { match } from 'ts-pattern';

interface StateFacts {
  readonly proposal: { readonly state: string; readonly deferUntil: Date | null };
  readonly answeredOn: string | null;
  readonly isAnsweredHere: boolean;
  readonly call: {
    readonly state: 'waiting' | 'applied' | 'failed' | 'unknown';
    readonly reason: string | null;
  } | null;
}

// The state a card shows from its row's records: a closed row by its outcome, an approved action by
// what became of its call, a deferred row with its return time, and an open row not at all.
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

  const outcome = formatOutcome(item);

  return item.answeredOn !== null && !item.isAnsweredHere
    ? `${outcome} on ${item.answeredOn}`
    : outcome;
}

const closedStates: Readonly<Record<string, string>> = {
  approved: 'Approved',
  declined: 'Declined',
  lapsed: 'Lapsed',
  withdrawn: 'Withdrawn',
};

function formatOutcome(item: StateFacts): string {
  const state = item.proposal.state;
  const call = state === 'approved' ? item.call : null;

  if (call === null) {
    return closedStates[state] ?? state;
  }

  return match(call.state)
    .with('applied', () => 'Approved, applied')
    .with('waiting', () => 'Approved, waiting to run')
    .with('unknown', () => 'Approved, outcome unknown')
    .with('failed', () => `Approved, failed: ${call.reason ?? 'the call failed'}`)
    .exhaustive();
}
