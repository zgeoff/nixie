// A part read another part that it uses before that part started.
export class PartNotStartedError extends Error {
  override readonly name = 'PartNotStartedError';

  constructor(part: string) {
    super(`part ${part} has not started`);
  }
}
