export class SkillProposalStaleError extends Error {
  override readonly name = 'SkillProposalStaleError';

  readonly code = 'STALE_BASE';

  constructor(proposalID: string) {
    super(`the skill in force moved past the version skill proposal ${proposalID} replaces`);
  }
}
