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

// Undo, redo and every unlisted inputType count as unknown, because memory evidence needs an
// affirmative typed, so an inputType that says nothing of the text's origin fails closed.
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
