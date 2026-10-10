// A snapshot failed to parse or validate, so the seed refuses it and keeps the last seed. problems
// names each file at fault and what is wrong with it.
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
