import { expect, test } from 'bun:test';
import { buildTurnCases } from './build-turn-cases.ts';

test('it keeps the items a turn retrieval logged', () => {
  const cases = buildTurnCases({
    records: [
      {
        sequence: 1,
        recordedAt: '2026-03-02T09:00:00Z',
        kind: 'owner_message',
        thread: 'conversation',
        parent: null,
        payload: {},
        erasable: { status: 'readable', fields: { text: 'when is the dentist?' } },
      },
      {
        sequence: 2,
        recordedAt: '2026-03-02T09:00:01Z',
        kind: 'task.step_started',
        thread: 'conversation',
        parent: null,
        payload: {},
        erasable: { status: 'none' },
      },
      {
        sequence: 3,
        recordedAt: '2026-03-02T09:00:02Z',
        kind: 'memory.recalled',
        thread: 'conversation',
        parent: null,
        payload: { items: [{ itemID: 'item-a', version: 2, score: 1.5 }], searchMode: 'hybrid' },
        erasable: { status: 'none' },
      },
    ],
    items: [],
    versions: [],
    notes: [],
  });

  expect(cases.map((turn) => turn.logged)).toStrictEqual([[{ itemID: 'item-a', version: 2, score: 1.5 }]]);
});

test('it gives a turn the ratings of its retrieval', () => {
  const cases = buildTurnCases({
    records: [
      {
        sequence: 1,
        recordedAt: '2026-03-02T09:00:00Z',
        kind: 'owner_message',
        thread: 'conversation',
        parent: null,
        payload: {},
        erasable: { status: 'readable', fields: { text: 'when is the dentist?' } },
      },
      {
        sequence: 2,
        recordedAt: '2026-03-02T09:00:01Z',
        kind: 'task.step_started',
        thread: 'conversation',
        parent: null,
        payload: {},
        erasable: { status: 'none' },
      },
      {
        sequence: 3,
        recordedAt: '2026-03-02T09:00:02Z',
        kind: 'memory.recalled',
        thread: 'conversation',
        parent: null,
        payload: { items: [{ itemID: 'item-a', version: 2 }], searchMode: 'hybrid' },
        erasable: { status: 'none' },
      },
      {
        sequence: 4,
        recordedAt: '2026-03-02T09:05:00Z',
        kind: 'memory.rated',
        thread: null,
        parent: null,
        payload: { recalledSequence: 3, ratings: [{ itemID: 'item-a', version: 2, verdict: 'noise' }] },
        erasable: { status: 'none' },
      },
    ],
    items: [],
    versions: [],
    notes: [],
  });

  expect(cases.map((turn) => turn.ratings)).toStrictEqual([[{ itemID: 'item-a', verdict: 'noise', note: null }]]);
});

test('it rejects a rating whose verdict is a number', () => {
  expect(() =>
    buildTurnCases({
      records: [
        {
          sequence: 4,
          recordedAt: '2026-03-02T09:05:00Z',
          kind: 'memory.rated',
          thread: null,
          parent: null,
          payload: { recalledSequence: 3, ratings: [{ itemID: 'item-a', version: 2, verdict: 1 }] },
          erasable: { status: 'none' },
        },
      ],
      items: [],
      versions: [],
      notes: [],
    }),
  ).toThrow('record 4 (memory.rated) does not match its schema at ratings.0.verdict');
});

test('it rejects a turn retrieval whose logged items hold a null', () => {
  expect(() =>
    buildTurnCases({
      records: [
        {
          sequence: 1,
          recordedAt: '2026-03-02T09:00:00Z',
          kind: 'owner_message',
          thread: 'conversation',
          parent: null,
          payload: {},
          erasable: { status: 'readable', fields: { text: 'when is the dentist?' } },
        },
        {
          sequence: 2,
          recordedAt: '2026-03-02T09:00:01Z',
          kind: 'task.step_started',
          thread: 'conversation',
          parent: null,
          payload: {},
          erasable: { status: 'none' },
        },
        {
          sequence: 3,
          recordedAt: '2026-03-02T09:00:02Z',
          kind: 'memory.recalled',
          thread: 'conversation',
          parent: null,
          payload: { items: [null], searchMode: 'hybrid' },
          erasable: { status: 'none' },
        },
      ],
      items: [],
      versions: [],
      notes: [],
    }),
  ).toThrow('record 3 (memory.recalled) does not match its schema at items.0');
});
