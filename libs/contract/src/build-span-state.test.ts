import { expect, test } from 'bun:test';
import { buildPendingInput } from './build-pending-input';
import { buildSpanState } from './build-span-state';

test('it labels text typed after a paste as typed', () => {
  expect(
    buildSpanState(
      {
        spans: [
          { end: 6, source: 'typed', start: 0 },
          { end: 12, source: 'pasted', start: 6 },
        ],
        text: 'hello PASTED',
      },
      { selection: { backward: false, end: 12, start: 12 }, source: 'typed' },
      'hello PASTED world',
    ),
  ).toStrictEqual({
    spans: [
      { end: 6, source: 'typed', start: 0 },
      { end: 12, source: 'pasted', start: 6 },
      { end: 18, source: 'typed', start: 12 },
    ],
    text: 'hello PASTED world',
  });
});

test('it splits a pasted span that typing lands inside', () => {
  expect(
    buildSpanState(
      { spans: [{ end: 6, source: 'pasted', start: 0 }], text: 'PASTED' },
      { selection: { backward: false, end: 3, start: 3 }, source: 'typed' },
      'PASxTED',
    ),
  ).toStrictEqual({
    spans: [
      { end: 3, source: 'pasted', start: 0 },
      { end: 4, source: 'typed', start: 3 },
      { end: 7, source: 'pasted', start: 4 },
    ],
    text: 'PASxTED',
  });
});

test('it places a paste next to repeated text at the selection', () => {
  expect(
    buildSpanState(
      { spans: [{ end: 2, source: 'typed', start: 0 }], text: 'ab' },
      { selection: { backward: false, end: 1, start: 1 }, source: 'pasted' },
      'abab',
    ),
  ).toStrictEqual({
    spans: [
      { end: 1, source: 'typed', start: 0 },
      { end: 3, source: 'pasted', start: 1 },
      { end: 4, source: 'typed', start: 3 },
    ],
    text: 'abab',
  });
});

test('it labels an edit with no pending input as unknown', () => {
  expect(
    buildSpanState(
      { spans: [{ end: 2, source: 'typed', start: 0 }], text: 'ab' },
      undefined,
      'abab',
    ),
  ).toStrictEqual({
    spans: [
      { end: 2, source: 'typed', start: 0 },
      { end: 4, source: 'unknown', start: 2 },
    ],
    text: 'abab',
  });
});

test('it labels the whole of a paste over a selection that shares letters with it', () => {
  expect(
    buildSpanState(
      { spans: [{ end: 3, source: 'typed', start: 0 }], text: 'cat' },
      { selection: { backward: false, end: 3, start: 0 }, source: 'pasted' },
      'bat',
    ),
  ).toStrictEqual({ spans: [{ end: 3, source: 'pasted', start: 0 }], text: 'bat' });
});

test('it removes the typed character when a backspace sits between a typed and a pasted one', () => {
  expect(
    buildSpanState(
      {
        spans: [
          { end: 1, source: 'typed', start: 0 },
          { end: 2, source: 'pasted', start: 1 },
        ],
        text: 'aa',
      },
      buildPendingInput({ inputType: 'deleteContentBackward', selectionEnd: 1, selectionStart: 1 }),
      'a',
    ),
  ).toStrictEqual({ spans: [{ end: 1, source: 'pasted', start: 0 }], text: 'a' });
});

test('it removes the pasted character when a forward delete sits between a typed and a pasted one', () => {
  expect(
    buildSpanState(
      {
        spans: [
          { end: 1, source: 'typed', start: 0 },
          { end: 2, source: 'pasted', start: 1 },
        ],
        text: 'aa',
      },
      buildPendingInput({ inputType: 'deleteContentForward', selectionEnd: 1, selectionStart: 1 }),
      'a',
    ),
  ).toStrictEqual({ spans: [{ end: 1, source: 'typed', start: 0 }], text: 'a' });
});

test.each(['historyUndo', 'historyRedo'])(
  'it labels text that %s restores as unknown',
  (inputType) => {
    expect(
      buildSpanState(
        { spans: [{ end: 12, source: 'typed', start: 0 }], text: 'hello  world' },
        buildPendingInput({ inputType, selectionEnd: 6, selectionStart: 6 }),
        'hello PASTED world',
      ),
    ).toStrictEqual({
      spans: [
        { end: 6, source: 'typed', start: 0 },
        { end: 12, source: 'unknown', start: 6 },
        { end: 18, source: 'typed', start: 12 },
      ],
      text: 'hello PASTED world',
    });
  },
);

test('it counts offsets in UTF-16 code units', () => {
  expect(
    buildSpanState(
      { spans: [{ end: 3, source: 'typed', start: 0 }], text: '😀 ' },
      buildPendingInput({ inputType: 'insertFromPaste', selectionEnd: 3, selectionStart: 3 }),
      '😀 é😀',
    ),
  ).toStrictEqual({
    spans: [
      { end: 3, source: 'typed', start: 0 },
      { end: 6, source: 'pasted', start: 3 },
    ],
    text: '😀 é😀',
  });
});

test('it never ends a span between the 2 halves of a pair that shares its high surrogate', () => {
  expect(
    buildSpanState({ spans: [{ end: 2, source: 'typed', start: 0 }], text: '😀' }, undefined, '😁'),
  ).toStrictEqual({ spans: [{ end: 2, source: 'unknown', start: 0 }], text: '😁' });
});

test('it never starts a span between the 2 halves of a pair that shares its low surrogate', () => {
  expect(
    buildSpanState({ spans: [{ end: 2, source: 'typed', start: 0 }], text: '😀' }, undefined, '🈀'),
  ).toStrictEqual({ spans: [{ end: 2, source: 'unknown', start: 0 }], text: '🈀' });
});

test('it leaves no span once the text is empty', () => {
  expect(
    buildSpanState(
      { spans: [{ end: 6, source: 'pasted', start: 0 }], text: 'PASTED' },
      buildPendingInput({ inputType: 'deleteContentBackward', selectionEnd: 6, selectionStart: 0 }),
      '',
    ),
  ).toStrictEqual({ spans: [], text: '' });
});
