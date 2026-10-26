import { expect, test } from 'bun:test';
import { buildPendingInput } from './build-pending-input';
import { buildSpanState } from './build-span-state';
import { buildSpanStateFromEvents } from './test-utils/build-span-state-from-events';
import { gboardPastedEvents } from './test-utils/gboard-pasted-events';
import { gboardTypedEvents } from './test-utils/gboard-typed-events';
import { gboardVoiceEvents } from './test-utils/gboard-voice-events';

test.each([
  ['key by key typing', 'typing', 'The blue kettle is warm'],
  ['tapped word completions', 'completion', 'Kettle warm '],
  ['tapped next-word predictions', 'prediction', 'Good luck with the '],
  ['an autocorrection and a tapped fix', 'correction', 'The kettle is warm '],
  [
    'a sentence typed with suggestions',
    'natural',
    'Remember that the garden gate sticks in winter',
  ],
  ['a run-together word that autocorrect split', 'respaced-autocorrect', 'The garden gate sticks'],
] as const)('it labels Gboard %s as typed', (_label, recorded, text) => {
  expect(buildSpanStateFromEvents(gboardTypedEvents[recorded])).toStrictEqual({
    spans: [{ end: text.length, source: 'typed', start: 0 }],
    text,
  });
});

test('it labels a Gboard long-press paste as pasted', () => {
  expect(buildSpanStateFromEvents(gboardPastedEvents['long-press'])).toStrictEqual({
    spans: [{ end: 21, source: 'pasted', start: 0 }],
    text: 'long-press test words',
  });
});

test('it labels the Gboard clipboard chip as unknown', () => {
  expect(buildSpanStateFromEvents(gboardPastedEvents.chip)).toStrictEqual({
    spans: [{ end: 15, source: 'unknown', start: 0 }],
    text: 'chip test words',
  });
});

test.each([
  ['run-1', 'Our silver kite drifts on Sunday'],
  ['run-2', 'Planning to paint the workshop on Friday'],
  ['run-3', 'Book the dentist about the cracked cab'],
] as const)('it labels the Gboard voice typing of %s as unknown', (recorded, text) => {
  expect(buildSpanStateFromEvents(gboardVoiceEvents[recorded])).toStrictEqual({
    spans: [{ end: text.length, source: 'unknown', start: 0 }],
    text,
  });
});

test('it labels a Gboard voice composition of one word as typed', () => {
  expect(buildSpanStateFromEvents(gboardVoiceEvents['run-1'].slice(0, 2))).toStrictEqual({
    spans: [{ end: 3, source: 'typed', start: 0 }],
    text: 'Our',
  });
});

test('it labels a respaced insert as typed when it puts back typed text the delete before it removed', () => {
  expect(
    buildSpanState(
      {
        removed: { at: 4, text: 'gardengate' },
        spans: [{ end: 4, source: 'typed', start: 0 }],
        text: 'The ',
      },
      buildPendingInput({
        inputType: 'insertText',
        data: 'garden gate ',
        selectionEnd: 4,
        selectionStart: 4,
      }),
      'The garden gate ',
    ),
  ).toStrictEqual({ spans: [{ end: 16, source: 'typed', start: 0 }], text: 'The garden gate ' });
});

test('it labels a respaced insert as unknown when the text it puts back was pasted', () => {
  expect(
    buildSpanStateFromEvents([
      { event: 'beforeinput', inputType: 'insertFromPaste', data: 'gardengate', selection: [0, 0] },
      { event: 'input', value: 'gardengate' },
      { event: 'beforeinput', inputType: 'deleteContentBackward', data: null, selection: [0, 10] },
      { event: 'input', value: '' },
      { event: 'beforeinput', inputType: 'insertText', data: 'garden gate ', selection: [0, 0] },
      { event: 'input', value: 'garden gate ' },
    ]),
  ).toStrictEqual({ spans: [{ end: 12, source: 'unknown', start: 0 }], text: 'garden gate ' });
});

test('it labels an insert of several words as unknown when its letters differ from the removed text', () => {
  expect(
    buildSpanState(
      { removed: { at: 0, text: 'gardengste' }, spans: [], text: '' },
      buildPendingInput({
        inputType: 'insertText',
        data: 'garden gate ',
        selectionEnd: 0,
        selectionStart: 0,
      }),
      'garden gate ',
    ),
  ).toStrictEqual({ spans: [{ end: 12, source: 'unknown', start: 0 }], text: 'garden gate ' });
});

test('it labels an insert of several words as unknown when it lands away from the removed text', () => {
  expect(
    buildSpanState(
      {
        removed: { at: 0, text: 'gardengate' },
        spans: [{ end: 4, source: 'typed', start: 0 }],
        text: 'The ',
      },
      buildPendingInput({
        inputType: 'insertText',
        data: 'garden gate ',
        selectionEnd: 4,
        selectionStart: 4,
      }),
      'The garden gate ',
    ),
  ).toStrictEqual({
    spans: [
      { end: 4, source: 'typed', start: 0 },
      { end: 16, source: 'unknown', start: 4 },
    ],
    text: 'The garden gate ',
  });
});

test('it forgets the removed text once another edit lands', () => {
  expect(
    buildSpanStateFromEvents([
      { event: 'beforeinput', inputType: 'insertText', data: 'ab', selection: [0, 0] },
      { event: 'input', value: 'ab' },
      { event: 'beforeinput', inputType: 'deleteContentBackward', data: null, selection: [0, 2] },
      { event: 'input', value: '' },
      { event: 'beforeinput', inputType: 'insertText', data: 'x', selection: [0, 0] },
      { event: 'input', value: 'x' },
    ]),
  ).toStrictEqual({ spans: [{ end: 1, source: 'typed', start: 0 }], text: 'x' });
});

test('it keeps the typed text that a delete removed, until the next edit', () => {
  expect(
    buildSpanState(
      { spans: [{ end: 14, source: 'typed', start: 0 }], text: 'The gardengate' },
      buildPendingInput({
        inputType: 'deleteContentBackward',
        data: null,
        selectionEnd: 14,
        selectionStart: 4,
      }),
      'The ',
    ),
  ).toStrictEqual({
    removed: { at: 4, text: 'gardengate' },
    spans: [{ end: 4, source: 'typed', start: 0 }],
    text: 'The ',
  });
});

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

test('it labels only the changed text unknown when an edit lands away from the selection', () => {
  expect(
    buildSpanState(
      {
        spans: [
          { end: 7, source: 'pasted', start: 0 },
          { end: 11, source: 'typed', start: 7 },
        ],
        text: 'PASTED wrod',
      },
      buildPendingInput({
        inputType: 'insertReplacementText',
        data: null,
        selectionEnd: 0,
        selectionStart: 0,
      }),
      'PASTED word',
    ),
  ).toStrictEqual({
    spans: [
      { end: 7, source: 'pasted', start: 0 },
      { end: 8, source: 'typed', start: 7 },
      { end: 10, source: 'unknown', start: 8 },
      { end: 11, source: 'typed', start: 10 },
    ],
    text: 'PASTED word',
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
      buildPendingInput({
        inputType: 'deleteContentBackward',
        data: null,
        selectionEnd: 1,
        selectionStart: 1,
      }),
      'a',
    ),
  ).toStrictEqual({
    removed: { at: 0, text: 'a' },
    spans: [{ end: 1, source: 'pasted', start: 0 }],
    text: 'a',
  });
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
      buildPendingInput({
        inputType: 'deleteContentForward',
        data: null,
        selectionEnd: 1,
        selectionStart: 1,
      }),
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
        buildPendingInput({ inputType, data: null, selectionEnd: 6, selectionStart: 6 }),
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
      buildPendingInput({
        inputType: 'insertFromPaste',
        data: null,
        selectionEnd: 3,
        selectionStart: 3,
      }),
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
      buildPendingInput({
        inputType: 'deleteContentBackward',
        data: null,
        selectionEnd: 6,
        selectionStart: 0,
      }),
      '',
    ),
  ).toStrictEqual({ spans: [], text: '' });
});
