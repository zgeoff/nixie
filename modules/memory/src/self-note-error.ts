// A change that a self-note never takes: a self-note from anyone but the conversation, an edit of
// one by the note-taker, or a revision across subjects. The model reads the message as the tool's
// refusal.
export class SelfNoteError extends Error {
  override readonly name = 'SelfNoteError';

  readonly code = 'SELF_NOTE_REFUSED';
}
