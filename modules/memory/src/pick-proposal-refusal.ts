import type { ProposalRefusal, SharedProposal, SharedProposalState } from '@heynixie/proposals';
import { ProposalClosedError } from './proposal-closed-error';

const closedStates: Readonly<Record<string, SharedProposalState | undefined>> = {
  rejected: 'declined',
  consumed: 'approved',
  lapsed: 'lapsed',
};

const memoryRefusals: ReadonlySet<string> = new Set([
  'PIN_EDIT',
  'PINNED_CORE_FULL',
  'RETIREMENT_EDIT',
  'REVISION_TARGET',
  'SELF_NOTE_REFUSED',
  'WRONG_STATE',
]);

// What memory's own errors mean on the shared path. An error that no refusal covers is a fault.
export function pickProposalRefusal(error: unknown, row: SharedProposal): ProposalRefusal | null {
  if (error instanceof ProposalClosedError) {
    return { error: 'CLOSED', state: closedStates[error.status] ?? 'lapsed' };
  }

  const code = error instanceof Error && 'code' in error ? error.code : null;

  if (code === 'PROPOSAL_HASH' || code === 'STALE_VERSION') {
    return {
      error: 'CONFLICT',
      current: { actionHash: `${row.actionHash}:moved`, ruleHash: null },
    };
  }

  if (code === 'NOT_FOUND') {
    return { error: 'NOT_FOUND' };
  }

  return typeof code === 'string' && memoryRefusals.has(code)
    ? { error: 'NOT_ALLOWED', reason: code }
    : null;
}
