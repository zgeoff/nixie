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

test('it treats a pinned item that retired and came back as unpinned', () => {
  const cases = buildTurnCases({
    records: [
      {
        sequence: 1,
        recordedAt: '2026-03-02T08:00:00Z',
        kind: 'memory.pinned',
        thread: null,
        parent: null,
        payload: { itemID: 'item-a', isPinned: true },
        erasable: { status: 'none' },
      },
      {
        sequence: 2,
        recordedAt: '2026-03-02T08:10:00Z',
        kind: 'memory.version_added',
        thread: null,
        parent: null,
        payload: { itemID: 'item-a', version: 2, state: 'retired' },
        erasable: { status: 'none' },
      },
      {
        sequence: 3,
        recordedAt: '2026-03-02T08:20:00Z',
        kind: 'memory.version_added',
        thread: null,
        parent: null,
        payload: { itemID: 'item-a', version: 3, state: 'active' },
        erasable: { status: 'none' },
      },
      {
        sequence: 4,
        recordedAt: '2026-03-02T09:00:00Z',
        kind: 'owner_message',
        thread: 'conversation',
        parent: null,
        payload: {},
        erasable: { status: 'readable', fields: { text: 'when is the dentist?' } },
      },
      {
        sequence: 5,
        recordedAt: '2026-03-02T09:00:01Z',
        kind: 'task.step_started',
        thread: 'conversation',
        parent: null,
        payload: {},
        erasable: { status: 'none' },
      },
      {
        sequence: 6,
        recordedAt: '2026-03-02T09:00:02Z',
        kind: 'memory.recalled',
        thread: 'conversation',
        parent: null,
        payload: { items: [], searchMode: 'hybrid' },
        erasable: { status: 'none' },
      },
    ],
    items: [
      {
        item_id: 'item-a',
        version: 3,
        state: 'active',
        is_pinned: 0,
        pinned_sequence: null,
        created_sequence: 1,
        short_id: 'M1',
        kind: 'fact',
        subject: 'owner',
      },
    ],
    versions: [
      {
        item_id: 'item-a',
        version: 3,
        change: 'restored',
        state: 'active',
        sequence: 3,
        until: null,
        status: 'readable',
        text: 'The dentist is on Thursday',
      },
    ],
    notes: [],
  });

  expect(cases.map((turn) => turn.candidates.map((candidate) => candidate.isPinned))).toStrictEqual([[false]]);
});

test('it carries a message that no committed step read into the next step', () => {
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
        recordedAt: '2026-03-02T09:00:30Z',
        kind: 'task.step_committed',
        thread: 'conversation',
        parent: null,
        payload: { readCursor: 0 },
        erasable: { status: 'none' },
      },
      {
        sequence: 4,
        recordedAt: '2026-03-02T09:00:31Z',
        kind: 'task.step_started',
        thread: 'conversation',
        parent: null,
        payload: {},
        erasable: { status: 'none' },
      },
      {
        sequence: 5,
        recordedAt: '2026-03-02T09:00:32Z',
        kind: 'memory.recalled',
        thread: 'conversation',
        parent: null,
        payload: { items: [], searchMode: 'hybrid' },
        erasable: { status: 'none' },
      },
    ],
    items: [],
    versions: [],
    notes: [],
  });

  expect(cases.map((turn) => ({ caseID: turn.caseID, query: turn.query }))).toStrictEqual([
    { caseID: 't5', query: 'when is the dentist?' },
  ]);
});

test('it starts a step with no query once a committed step read the message', () => {
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
        recordedAt: '2026-03-02T09:00:30Z',
        kind: 'task.step_committed',
        thread: 'conversation',
        parent: null,
        payload: { readCursor: 1 },
        erasable: { status: 'none' },
      },
      {
        sequence: 4,
        recordedAt: '2026-03-02T09:00:31Z',
        kind: 'task.step_started',
        thread: 'conversation',
        parent: null,
        payload: {},
        erasable: { status: 'none' },
      },
      {
        sequence: 5,
        recordedAt: '2026-03-02T09:00:32Z',
        kind: 'memory.recalled',
        thread: 'conversation',
        parent: null,
        payload: { items: [], searchMode: 'hybrid' },
        erasable: { status: 'none' },
      },
    ],
    items: [],
    versions: [],
    notes: [],
  });

  expect(cases).toStrictEqual([]);
});

test('it counts a recall as delivered to the next turn once its turn ends', () => {
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
        payload: { items: [{ itemID: 'item-a', version: 1 }], searchMode: 'hybrid' },
        erasable: { status: 'none' },
      },
      {
        sequence: 4,
        recordedAt: '2026-03-02T09:00:20Z',
        kind: 'model.turn_ended',
        thread: 'conversation',
        parent: null,
        payload: { retrieved: [] },
        erasable: { status: 'none' },
      },
      {
        sequence: 5,
        recordedAt: '2026-03-02T09:00:21Z',
        kind: 'task.step_committed',
        thread: 'conversation',
        parent: null,
        payload: { readCursor: 1 },
        erasable: { status: 'none' },
      },
      {
        sequence: 6,
        recordedAt: '2026-03-02T09:10:00Z',
        kind: 'owner_message',
        thread: 'conversation',
        parent: null,
        payload: {},
        erasable: { status: 'readable', fields: { text: 'and the time?' } },
      },
      {
        sequence: 7,
        recordedAt: '2026-03-02T09:10:01Z',
        kind: 'task.step_started',
        thread: 'conversation',
        parent: null,
        payload: {},
        erasable: { status: 'none' },
      },
      {
        sequence: 8,
        recordedAt: '2026-03-02T09:10:02Z',
        kind: 'memory.recalled',
        thread: 'conversation',
        parent: null,
        payload: { items: [], searchMode: 'hybrid' },
        erasable: { status: 'none' },
      },
    ],
    items: [],
    versions: [],
    notes: [],
  });

  expect(cases.map((turn) => turn.delivered)).toStrictEqual([[], ['item-a@1']]);
});

test('it delivers only the recalls after a compaction in the same turn', () => {
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
        payload: { items: [{ itemID: 'item-a', version: 1 }], searchMode: 'hybrid' },
        erasable: { status: 'none' },
      },
      {
        sequence: 4,
        recordedAt: '2026-03-02T09:00:10Z',
        kind: 'model.compacted',
        thread: 'conversation',
        parent: null,
        payload: { recalledThrough: 3 },
        erasable: { status: 'none' },
      },
      {
        sequence: 5,
        recordedAt: '2026-03-02T09:00:11Z',
        kind: 'memory.recalled',
        thread: 'conversation',
        parent: null,
        payload: { items: [{ itemID: 'item-b', version: 1 }], searchMode: 'hybrid' },
        erasable: { status: 'none' },
      },
      {
        sequence: 6,
        recordedAt: '2026-03-02T09:00:20Z',
        kind: 'model.turn_ended',
        thread: 'conversation',
        parent: null,
        payload: { retrieved: [{ itemID: 'item-a', version: 1 }] },
        erasable: { status: 'none' },
      },
      {
        sequence: 7,
        recordedAt: '2026-03-02T09:00:21Z',
        kind: 'task.step_committed',
        thread: 'conversation',
        parent: null,
        payload: { readCursor: 1 },
        erasable: { status: 'none' },
      },
      {
        sequence: 8,
        recordedAt: '2026-03-02T09:10:00Z',
        kind: 'owner_message',
        thread: 'conversation',
        parent: null,
        payload: {},
        erasable: { status: 'readable', fields: { text: 'and the time?' } },
      },
      {
        sequence: 9,
        recordedAt: '2026-03-02T09:10:01Z',
        kind: 'task.step_started',
        thread: 'conversation',
        parent: null,
        payload: {},
        erasable: { status: 'none' },
      },
      {
        sequence: 10,
        recordedAt: '2026-03-02T09:10:02Z',
        kind: 'memory.recalled',
        thread: 'conversation',
        parent: null,
        payload: { items: [], searchMode: 'hybrid' },
        erasable: { status: 'none' },
      },
    ],
    items: [],
    versions: [],
    notes: [],
  });

  expect(cases.at(-1)?.delivered).toStrictEqual(['item-b@1']);
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
