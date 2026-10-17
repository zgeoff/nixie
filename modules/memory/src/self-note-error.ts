// A change that a self-note never takes: a pin, a self-note from anyone but the conversation, or
// a revision across kinds. The model reads the message as the tool's refusal.
export class SelfNoteError extends Error {
  override readonly name = 'SelfNoteError';

  readonly code = 'SELF_NOTE_REFUSED';
}
