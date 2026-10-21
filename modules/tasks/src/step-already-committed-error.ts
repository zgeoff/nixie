export class StepAlreadyCommittedError extends Error {
  override readonly name = 'StepAlreadyCommittedError';

  constructor(stepKey: string) {
    super(`step ${stepKey} has already committed`);
  }
}
