import type { SpanSource } from './types';

const pastedInputTypes = new Set(['insertFromPaste', 'insertFromPasteAsQuotation']);

const typedInputTypes = new Set([
  'insertCompositionText',
  'insertLineBreak',
  'insertParagraph',
  'insertReplacementText',
  'insertText',
]);

// Maps a browser InputEvent.inputType to the source of the text it inserts. Every other input
// type counts as unknown, undo and redo included, because they restore text without saying where
// it came from. Memory evidence needs an affirmative typed, so an unlisted type fails closed.
export function pickSpanSource(inputType: string): SpanSource {
  if (pastedInputTypes.has(inputType)) {
    return 'pasted';
  }
  if (inputType === 'insertFromDrop') {
    return 'dropped';
  }
  if (typedInputTypes.has(inputType)) {
    return 'typed';
  }
  return 'unknown';
}
