export class DefinitionsParseError extends Error {
  override readonly name = 'DefinitionsParseError';

  readonly problems: readonly ParseProblem[];

  constructor(problems: readonly ParseProblem[]) {
    super(problems.map((problem) => `${problem.path}: ${problem.reason}`).join('; '));

    this.problems = problems;
  }
}

export interface ParseProblem {
  readonly path: string;
  readonly reason: string;
}
