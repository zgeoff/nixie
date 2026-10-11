// A step key commits once: a second commit for the same key, such as a runner that lost its lease
// racing the rerun, fails on the unique step key and changes nothing.
export class StepAlreadyCommittedError extends Error {
  override readonly name = 'StepAlreadyCommittedError';

  constructor(stepKey: string) {
    super(`step ${stepKey} has already committed`);
  }
}
