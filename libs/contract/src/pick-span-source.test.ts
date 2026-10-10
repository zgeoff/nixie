import { expect, test } from 'bun:test';
import { pickSpanSource } from './pick-span-source';

test.each([
  ['insertText', 'typed'],
  ['insertCompositionText', 'typed'],
  ['insertLineBreak', 'typed'],
  ['insertParagraph', 'typed'],
  ['insertReplacementText', 'typed'],
  ['insertFromPaste', 'pasted'],
  ['insertFromPasteAsQuotation', 'pasted'],
  ['insertFromDrop', 'dropped'],
  ['historyUndo', 'unknown'],
  ['historyRedo', 'unknown'],
  ['insertFromYank', 'unknown'],
  ['deleteContentBackward', 'unknown'],
  ['', 'unknown'],
] as const)('it labels the input type %p as %s', (inputType, source) => {
  expect(pickSpanSource(inputType)).toBe(source);
});
