import { expect, test } from 'bun:test';
import { buildPendingInput } from './build-pending-input';

test('it labels a paste from beforeinput and pins the selection it replaces', () => {
  expect(
    buildPendingInput({
      inputType: 'insertFromPaste',
      data: null,
      selectionEnd: 7,
      selectionStart: 3,
    }),
  ).toStrictEqual({ selection: { backward: false, end: 7, start: 3 }, source: 'pasted' });
});

test('it marks a backward delete so the edit ends at the caret', () => {
  expect(
    buildPendingInput({
      inputType: 'deleteContentBackward',
      data: null,
      selectionEnd: 4,
      selectionStart: 4,
    }),
  ).toStrictEqual({ selection: { backward: true, end: 4, start: 4 }, source: 'unknown' });
});

test('it labels an undo as unknown', () => {
  expect(
    buildPendingInput({ inputType: 'historyUndo', data: null, selectionEnd: 0, selectionStart: 0 }),
  ).toStrictEqual({ selection: { backward: false, end: 0, start: 0 }, source: 'unknown' });
});

test('it labels one insertText of several words as unknown, as the clipboard chip sends it', () => {
  expect(
    buildPendingInput({
      inputType: 'insertText',
      data: 'chip test words',
      selectionEnd: 0,
      selectionStart: 0,
    }),
  ).toStrictEqual({
    respacing: 'chip test words',
    selection: { backward: false, end: 0, start: 0 },
    source: 'unknown',
  });
});
