import type { PromptProposalProblem } from './types';

export class PromptProposalCheckError extends Error {
  override readonly name = 'PromptProposalCheckError';

  readonly code = 'PROMPT_CHECK';

  readonly problems: readonly PromptProposalProblem[];

  constructor(proposalID: string, problems: readonly PromptProposalProblem[]) {
    const reasons = problems.map((problem) => `${problem.path}: ${problem.reason}`).join('; ');

    super(
      `the override approved for prompt proposal ${proposalID} fails the definitions checks: ${reasons}`,
    );

    this.problems = problems;
  }
}
