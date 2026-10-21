import type { ParseProblem } from '@heynixie/definitions';

export class SkillProposalCheckError extends Error {
  override readonly name = 'SkillProposalCheckError';

  readonly code = 'SKILL_CHECK';

  readonly problems: readonly ParseProblem[];

  constructor(proposalID: string, problems: readonly ParseProblem[]) {
    const reasons = problems.map((problem) => `${problem.path}: ${problem.reason}`).join('; ');

    super(`the files approved for skill proposal ${proposalID} fail the seed checks: ${reasons}`);

    this.problems = problems;
  }
}
