import type { ProposalOutcome, ProposalStatus } from './types';

const transitions: Readonly<Record<ProposalStatus, readonly ProposalOutcome[]>> = {
  pending: ['approved', 'rejected', 'lapsed'],
  approved: [],
  rejected: [],
  lapsed: [],
};

export function canMoveProposal(from: ProposalStatus, to: ProposalOutcome): boolean {
  return transitions[from].includes(to);
}
