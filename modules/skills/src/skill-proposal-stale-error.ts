// The version of the skill in force moved past the one the proposal replaces, so the proposal's
// diff no longer shows what an answer would change, and nothing is recorded.
export class SkillProposalStaleError extends Error {
  override readonly name = 'SkillProposalStaleError';

  readonly code = 'STALE_BASE';

  constructor(proposalID: string) {
    super(`the skill in force moved past the version skill proposal ${proposalID} replaces`);
  }
}
