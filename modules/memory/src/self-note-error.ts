export class SelfNoteError extends Error {
  override readonly name = 'SelfNoteError';

  readonly code = 'SELF_NOTE_REFUSED';
}
