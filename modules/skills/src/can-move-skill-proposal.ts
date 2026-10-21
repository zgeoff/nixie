import type { SkillProposalOutcome, SkillProposalStatus } from './types';

const transitions: Readonly<Record<SkillProposalStatus, readonly SkillProposalOutcome[]>> = {
  pending: ['approved', 'rejected', 'lapsed'],
  approved: [],
  rejected: [],
  lapsed: [],
};

export function canMoveSkillProposal(from: SkillProposalStatus, to: SkillProposalOutcome): boolean {
  return transitions[from].includes(to);
}
