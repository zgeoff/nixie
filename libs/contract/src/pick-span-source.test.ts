import { expect, test } from 'bun:test';
import { pickSpanSource } from './pick-span-source';

test.each([
  ['insertText', 'a', 'typed'],
  ['insertCompositionText', 'a', 'typed'],
  ['insertLineBreak', null, 'typed'],
  ['insertParagraph', null, 'typed'],
  ['insertReplacementText', null, 'typed'],
  ['insertFromPaste', null, 'pasted'],
  ['insertFromPasteAsQuotation', null, 'pasted'],
  ['insertFromDrop', null, 'dropped'],
  ['historyUndo', null, 'unknown'],
  ['historyRedo', null, 'unknown'],
  ['insertFromYank', null, 'unknown'],
  ['deleteContentBackward', null, 'unknown'],
  ['', null, 'unknown'],
] as const)('it labels the input type %p as %s', (inputType, data, source) => {
  expect(pickSpanSource(inputType, data)).toBe(source);
});

test.each([
  ['a typed letter', 'H', 'typed'],
  ['a typed space', ' ', 'typed'],
  ['a prediction with its trailing space', 'tomorrow ', 'typed'],
  ['a swiped word', 'works', 'typed'],
  ['the clipboard chip', 'chip test words', 'unknown'],
  ['an undo that restores 2 words', 'pastedx words', 'unknown'],
  ['2 words split by a line break', 'hello\nworld', 'unknown'],
] as const)('it labels an insertText of %s as %s', (_label, data, source) => {
  expect(pickSpanSource('insertText', data)).toBe(source);
});
