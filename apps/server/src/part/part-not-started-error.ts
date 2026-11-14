export class PartNotStartedError extends Error {
  override readonly name = 'PartNotStartedError';

  constructor(part: string) {
    super(`part ${part} has not started`);
  }
}
