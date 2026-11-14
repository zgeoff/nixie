export class UnauthorizedError extends Error {
  override readonly name = 'UnauthorizedError';

  constructor() {
    super('the answer has no live caller');
  }
}
