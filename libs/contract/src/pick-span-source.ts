import { hasSeveralWords } from './has-several-words';
import type { SpanSource } from './types';

const pastedInputTypes = new Set(['insertFromPaste', 'insertFromPasteAsQuotation']);

const typedInputTypes = new Set([
  'insertCompositionText',
  'insertLineBreak',
  'insertParagraph',
  'insertReplacementText',
  'insertText',
]);

// Maps a browser InputEvent.inputType and its data to the source of the text it inserts. Undo,
// redo and every unlisted type count as unknown, because memory evidence needs an affirmative
// typed, so a type that says nothing of where its text came from fails closed.
export function pickSpanSource(inputType: string, data: string | null): SpanSource {
  if (pastedInputTypes.has(inputType)) {
    return 'pasted';
  }

  if (inputType === 'insertFromDrop') {
    return 'dropped';
  }

  if (inputType === 'insertText' && data !== null && hasSeveralWords(data)) {
    return 'unknown';
  }

  if (typedInputTypes.has(inputType)) {
    return 'typed';
  }

  return 'unknown';
}
