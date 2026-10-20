// The answer names a skill hash that is not the proposal's, so the review it came from showed other
// files, and nothing is recorded.
export class SkillProposalHashError extends Error {
  override readonly name = 'SkillProposalHashError';

  readonly code = 'PROPOSAL_HASH';

  constructor(proposalID: string) {
    super(`the answer to skill proposal ${proposalID} names another skill hash`);
  }
}
