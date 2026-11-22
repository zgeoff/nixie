// A refused note change throws, so the client action that its transaction wrote rolls back with it.
export class NoteRefusedError extends Error {
  override readonly name = 'NoteRefusedError';

  readonly reason: string;

  constructor(reason: string) {
    super(`the note change is refused as ${reason}`);

    this.reason = reason;
  }
}
