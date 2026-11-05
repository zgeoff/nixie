import { expect, test } from 'bun:test';
import { buildBlockTokens, collectBlockSources } from './count-turn-blocks.ts';

test('#buildBlockTokens counts nothing for a turn shown nothing and opening no session', () => {
  expect(
    buildBlockTokens(
      {
        caseID: 't3',
        stepSequence: 2,
        recalledSequence: 3,
        recordedAt: Date.parse('2026-03-02T09:00:00Z'),
        query: 'ok',
        typedQuery: 'ok',
        shownMessages: [],
        isSessionStart: false,
        contextTokens: null,
        reply: 'Noted.',
        earlier: [],
        candidates: [
          { itemID: 'item-a', version: 1, isSelf: false, isPinned: true, isLapsed: false, isSensitive: false, text: 'Lives by the canal' },
        ],
        logged: [],
        searchMode: 'hybrid',
        delivered: [],
        ratings: [],
      },
      { versions: new Map(), tasks: [] },
      { ownerName: null, defaultZone: 'UTC' },
    ),
  ).toStrictEqual({ pinned: 0, items: 0, selfNotes: 0, messages: 0, board: 0 });
});

test('#buildBlockTokens counts the pinned block, each retrieved block and the board on a session start', () => {
  const tokens = buildBlockTokens(
    {
      caseID: 't9',
      stepSequence: 8,
      recalledSequence: 9,
      recordedAt: Date.parse('2026-03-02T09:00:00Z'),
      query: 'what about the boat?',
      typedQuery: 'what about the boat?',
      shownMessages: [{ sequence: 4, text: 'the boat needs new rope', isCut: false }],
      isSessionStart: true,
      contextTokens: null,
      reply: 'Rope first.',
      earlier: [],
      candidates: [
        { itemID: 'item-a', version: 1, isSelf: false, isPinned: true, isLapsed: false, isSensitive: false, text: 'Lives by the canal' },
        { itemID: 'item-b', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Owns a narrowboat' },
        { itemID: 'item-c', version: 1, isSelf: true, isPinned: false, isLapsed: false, isSensitive: false, text: 'Asks before booking' },
      ],
      logged: [
        { itemID: 'item-b', version: 1 },
        { itemID: 'item-c', version: 1 },
      ],
      searchMode: 'hybrid',
      delivered: [],
      ratings: [],
    },
    { versions: new Map(), tasks: [{ sequence: 5, id: 'k1', name: 'Rope order', brief: 'Order rope', recordedAt: 0 }] },
    { ownerName: null, defaultZone: 'UTC' },
  );

  expect(Object.entries(tokens).filter(([, value]) => value === 0)).toStrictEqual([]);
});

test('#buildBlockTokens leaves a task created after the turn off the board', () => {
  expect(
    buildBlockTokens(
      {
        caseID: 't3',
        stepSequence: 2,
        recalledSequence: 3,
        recordedAt: 0,
        query: 'ok',
        typedQuery: 'ok',
        shownMessages: [],
        isSessionStart: false,
        contextTokens: null,
        reply: '',
        earlier: [],
        candidates: [],
        logged: [],
        searchMode: 'hybrid',
        delivered: [],
        ratings: [],
      },
      { versions: new Map(), tasks: [{ sequence: 7, id: 'k1', name: 'Rope order', brief: 'Order rope', recordedAt: 0 }] },
      { ownerName: null, defaultZone: 'UTC' },
    ).board,
  ).toBe(0);
});

test('#collectBlockSources takes a started task from its created record and each version line from the export', () => {
  const sources = collectBlockSources({
    records: [
      {
        sequence: 5,
        recordedAt: '2026-03-02T08:00:00Z',
        kind: 'task.created',
        thread: 'k1',
        parent: null,
        payload: { taskID: 'k1' },
        erasable: { status: 'readable', fields: { name: 'Rope order', brief: 'Order rope' } },
      },
    ],
    items: [
      {
        item_id: 'item-b',
        version: 1,
        state: 'active',
        is_pinned: 0,
        pinned_sequence: null,
        created_sequence: 1,
        short_id: 'm7',
        kind: 'fact',
        subject: 'owner',
      },
    ],
    versions: [
      {
        item_id: 'item-b',
        version: 1,
        change: 'created',
        state: 'active',
        sequence: 1,
        until: null,
        status: 'readable',
        text: 'Owns a narrowboat',
        quote: 'we bought the boat',
        origin: 'conversation',
        source: 'owner',
        recorded_at: 1000,
      },
    ],
    notes: [],
  });

  expect(sources).toStrictEqual({
    versions: new Map([
      ['item-b@1', { shortID: 'm7', subject: 'owner', origin: 'conversation', source: 'owner', recordedAt: 1000, quote: 'we bought the boat' }],
    ]),
    tasks: [{ sequence: 5, id: 'k1', name: 'Rope order', brief: 'Order rope', recordedAt: Date.parse('2026-03-02T08:00:00Z') }],
  });
});
