import type { Erasable } from '@heynixie/log';
import type { TextErasureRequest } from './start-text-erasure';
import { startTextErasure } from './start-text-erasure';

// The text's runner methods. A text is hidden from the phone tools by its erased fields alone, so
// the forget keeps its row, its short ID and its provider message ID, which stops a poll that finds
// the text at the provider from storing it again.
export function buildTextErasable(): Erasable<TextErasureRequest> {
  return {
    start: (tx, request) => startTextErasure(tx, request),
    hide: () => Promise.resolve(),
    readChildren: () => Promise.resolve([]),
    toRequest: (target) => ({ text: target.targetID }),
    cleanIndexes: () => Promise.resolve(),
  };
}
