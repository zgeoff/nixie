// A refused moment change throws, so the client action that its transaction wrote rolls back with it.
export class MomentRefusedError extends Error {
  override readonly name = 'MomentRefusedError';

  readonly reason: string;

  constructor(reason: string) {
    super(`the moment change is refused as ${reason}`);

    this.reason = reason;
  }
}
