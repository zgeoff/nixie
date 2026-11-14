import { expect, test } from 'bun:test';
import { pickSpanSource } from './pick-span-source';

test.each([
  ['insertText', 'typed', 'a'],
  ['insertCompositionText', 'typed', 'a'],
  ['insertLineBreak', 'typed', null],
  ['insertParagraph', 'typed', null],
  ['insertReplacementText', 'typed', null],
  ['insertFromPaste', 'pasted', null],
  ['insertFromPasteAsQuotation', 'pasted', null],
  ['insertFromDrop', 'dropped', null],
  ['historyUndo', 'unknown', null],
  ['historyRedo', 'unknown', null],
  ['insertFromYank', 'unknown', null],
  ['deleteContentBackward', 'unknown', null],
  ['', 'unknown', null],
] as const)('it labels the input type %p as %s', (inputType, source, data) => {
  expect(pickSpanSource(inputType, data)).toBe(source);
});

test.each([
  ['a typed letter', 'typed', 'H'],
  ['a typed space', 'typed', ' '],
  ['a prediction with its trailing space', 'typed', 'tomorrow '],
  ['a swiped word', 'typed', 'works'],
  ['the clipboard chip', 'unknown', 'chip test words'],
  ['an undo that restores 2 words', 'unknown', 'pastedx words'],
  ['2 words split by a line break', 'unknown', 'hello\nworld'],
] as const)('it labels an insertText of %s as %s', (_label, source, data) => {
  expect(pickSpanSource('insertText', data)).toBe(source);
});

test.each([
  ['one word', 'typed', 'The'],
  ['one word with a trailing space', 'typed', 'The '],
  ['a recognized phrase', 'unknown', 'The garden gate'],
] as const)('it labels an insertCompositionText of %s as %s', (_label, source, data) => {
  expect(pickSpanSource('insertCompositionText', data)).toBe(source);
});
