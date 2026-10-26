import { expect, test } from 'bun:test';
import { buildLabelTurns } from './build-label-turns.ts';

test('it gathers the natural pairs of a turn with the 4 messages and replies before it', () => {
  const turns = buildLabelTurns(
    [
      {
        sequence: 1,
        recordedAt: '2026-03-02T08:00:00Z',
        kind: 'owner_message',
        thread: 'conversation',
        parent: null,
        payload: { spans: 'as_sent' },
        erasable: { status: 'readable', fields: { text: 'morning', spans: [] } },
      },
      {
        sequence: 2,
        recordedAt: '2026-03-02T08:00:05Z',
        kind: 'model.reply',
        thread: 'conversation',
        parent: null,
        payload: {},
        erasable: { status: 'readable', fields: { text: 'Morning! Anything on today?' } },
      },
      {
        sequence: 3,
        recordedAt: '2026-03-02T08:01:00Z',
        kind: 'owner_message',
        thread: 'conversation',
        parent: null,
        payload: { spans: 'as_sent' },
        erasable: { status: 'readable', fields: { text: 'the plumber comes Thursday', spans: [] } },
      },
      {
        sequence: 4,
        recordedAt: '2026-03-02T08:01:05Z',
        kind: 'model.reply',
        thread: 'conversation',
        parent: null,
        payload: {},
        erasable: { status: 'readable', fields: { text: 'Want me to remember that?' } },
      },
      {
        sequence: 5,
        recordedAt: '2026-03-02T08:01:06Z',
        kind: 'model.reply',
        thread: 'memory-writer',
        parent: null,
        payload: {},
        erasable: { status: 'readable', fields: { text: 'a reply in another thread' } },
      },
      {
        sequence: 6,
        recordedAt: '2026-03-02T08:02:00Z',
        kind: 'owner_message',
        thread: 'conversation',
        parent: null,
        payload: { spans: 'as_sent' },
        erasable: { status: 'readable', fields: { text: 'yes please', spans: [] } },
      },
    ],
    [
      {
        caseID: '7/8',
        bucket: 'natural',
        stepSequence: 7,
        messages: [{ sequence: 6, text: 'yes please', spans: [] }],
        call: {
          sequence: 8,
          tool: 'memory.remember',
          input: { text: 'The plumber comes Thursday' },
        },
      },
      {
        caseID: '7/9',
        bucket: 'natural',
        stepSequence: 7,
        messages: [{ sequence: 6, text: 'yes please', spans: [] }],
        call: { sequence: 9, tool: 'memory.pin', input: { id: 'M3' } },
      },
    ],
  );

  expect(turns).toStrictEqual([
    {
      stepSequence: 7,
      earlier: [
        { role: 'owner', text: 'morning' },
        { role: 'assistant', text: 'Morning! Anything on today?' },
        { role: 'owner', text: 'the plumber comes Thursday' },
        { role: 'assistant', text: 'Want me to remember that?' },
      ],
      messages: [{ sequence: 6, text: 'yes please', spans: [] }],
      calls: [
        { caseID: '7/8', tool: 'memory.remember', input: { text: 'The plumber comes Thursday' } },
        { caseID: '7/9', tool: 'memory.pin', input: { id: 'M3' } },
      ],
    },
  ]);
});

test('it keeps only the last 4 messages and replies before the turn', () => {
  const turns = buildLabelTurns(
    [1, 2, 3, 4, 5].map((sequence) => ({
      sequence,
      recordedAt: '2026-03-02T08:00:00Z',
      kind: sequence % 2 === 1 ? 'owner_message' : 'model.reply',
      thread: 'conversation',
      parent: null,
      payload: {},
      erasable: { status: 'readable' as const, fields: { text: `entry ${sequence}` } },
    })),
    [
      {
        caseID: '7/8',
        bucket: 'natural',
        stepSequence: 7,
        messages: [{ sequence: 6, text: 'retire that', spans: [] }],
        call: { sequence: 8, tool: 'memory.retire', input: { id: 'M1' } },
      },
    ],
  );

  expect(turns[0]?.earlier.map((entry) => entry.text)).toStrictEqual([
    'entry 2',
    'entry 3',
    'entry 4',
    'entry 5',
  ]);
});

test('it leaves out swapped pairs', () => {
  const turns = buildLabelTurns(
    [],
    [
      {
        caseID: '7/x3',
        bucket: 'swapped',
        stepSequence: 7,
        messages: [{ sequence: 6, text: 'retire that', spans: [] }],
        call: { sequence: 3, tool: 'web_fetch', input: { url: 'https://tides.example' } },
      },
    ],
  );

  expect(turns).toStrictEqual([]);
});
