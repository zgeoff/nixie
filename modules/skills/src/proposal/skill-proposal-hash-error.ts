export class SkillProposalHashError extends Error {
  override readonly name = 'SkillProposalHashError';

  readonly code = 'PROPOSAL_HASH';

  constructor(proposalID: string) {
    super(`the answer to skill proposal ${proposalID} names another skill hash`);
  }
}
