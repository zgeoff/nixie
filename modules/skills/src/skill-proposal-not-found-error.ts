// No skill proposal has the ID the answer names.
export class SkillProposalNotFoundError extends Error {
  override readonly name = 'SkillProposalNotFoundError';

  readonly code = 'NOT_FOUND';

  constructor(proposalID: string) {
    super(`no skill proposal ${proposalID} exists`);
  }
}
