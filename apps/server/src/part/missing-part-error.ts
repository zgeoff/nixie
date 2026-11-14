export class MissingPartError extends Error {
  override readonly name = 'MissingPartError';

  constructor(part: string, missing: string) {
    super(`part ${part} reads part ${missing}, which its declarations leave out`);
  }
}
