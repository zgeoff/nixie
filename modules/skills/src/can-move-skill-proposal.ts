import type { SkillProposalOutcome, SkillProposalStatus } from './types';

// Whether a skill proposal in the given status may close with the outcome: only a pending proposal
// closes, once, by your approval, your rejection or its lapse. Every writer of a closing record
// checks it inside its write transaction.
export function canMoveSkillProposal(from: SkillProposalStatus, to: SkillProposalOutcome): boolean {
  return transitions[from].includes(to);
}

const transitions: Readonly<Record<SkillProposalStatus, readonly SkillProposalOutcome[]>> = {
  pending: ['approved', 'rejected', 'lapsed'],
  approved: [],
  rejected: [],
  lapsed: [],
};
