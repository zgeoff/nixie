// A refusal changed nothing: its code, a sentence that holds the ID or the index it is about and
// never a note's text, and the figures some codes carry.
export interface NoteRefusal {
  readonly code: string;
  readonly message: string;
  readonly figures?: Readonly<Record<string, number>>;
}

export function buildRefusal(
  code: string,
  message: string,
  figures?: Readonly<Record<string, number>>,
): NoteRefusal {
  return figures === undefined ? { code, message } : { code, message, figures };
}
