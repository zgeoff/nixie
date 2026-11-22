import type { DirectResult } from '@heynixie/tools';
import type { NoteRefusal } from '../note/note-refusal';

// A refusal that changed nothing: its code and a sentence with the ID it is about, which the result
// record keeps as plain IDs and never as a note's text.
export function refuseNote(refusal: NoteRefusal): DirectResult {
  return {
    result: {
      refused: refusal.code,
      message: refusal.message,
      ...refusal.figures,
    },
    record: { refused: refusal.code },
    refusalCode: refusal.code,
  };
}
