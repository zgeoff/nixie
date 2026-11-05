import { expect, test } from 'bun:test';
import { buildBlockTokens } from './build-block-tokens.ts';

test('it counts nothing for a turn shown nothing and opening no session', () => {
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
        sessionNumber: 0,
        isShredded: false,
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
      { versions: new Map() },
      { ownerName: null, defaultZone: 'UTC' },
    ),
  ).toStrictEqual({ pinned: 0, pinnedChanges: 0, items: 0, selfNotes: 0, messages: 0 });
});

test('it counts the pinned block and each retrieved block on a session start', () => {
  const tokens = buildBlockTokens(
    {
      caseID: 't9',
      stepSequence: 8,
      recalledSequence: 9,
      recordedAt: Date.parse('2026-03-02T09:00:00Z'),
      query: 'what about the boat?',
      typedQuery: 'what about the boat?',
      shownMessages: [{ sequence: 4, thread: 'conversation', recordedAt: Date.parse('2026-03-02T09:00:00Z'), text: 'the boat needs new rope', isCut: false }],
      isSessionStart: true,
      sessionNumber: 1,
      isShredded: false,
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
    { versions: new Map() },
    { ownerName: null, defaultZone: 'UTC' },
  );

  expect(tokens).toStrictEqual({ pinned: 85, pinnedChanges: 0, items: 75, selfNotes: 76, messages: 76 });
});

test('it renders a retrieved item with its version metadata: short ID, origin, date and quote', () => {
  const tokens = buildBlockTokens(
    {
      caseID: 't6',
      stepSequence: 5,
      recalledSequence: 6,
      recordedAt: Date.parse('2026-03-02T09:00:00Z'),
      query: 'when is the boiler due?',
      typedQuery: 'when is the boiler due?',
      shownMessages: [],
      isSessionStart: false,
      sessionNumber: 1,
      isShredded: false,
      contextTokens: null,
      reply: 'October.',
      earlier: [],
      candidates: [
        { itemID: 'item-b', version: 3, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Boiler serviced each October' },
      ],
      logged: [{ itemID: 'item-b', version: 3 }],
      searchMode: 'hybrid',
      delivered: [],
      ratings: [],
    },
    {
      versions: new Map([
        [
          'item-b@3',
          {
            shortID: 'c2hd81mmqa',
            subject: 'owner',
            origin: 'conversation',
            source: 'owner',
            recordedAt: Date.parse('2025-10-13T10:00:00Z'),
            quote: 'the boiler gets serviced every October by the same engineer',
          },
        ],
      ]),
    },
    { ownerName: 'Sam', defaultZone: 'UTC' },
  );

  expect(tokens.items).toBe(98);
});

test('it counts the change note on a resumed turn whose pinned core changed since the turn before', () => {
  const tokens = buildBlockTokens(
    {
      caseID: 't4',
      stepSequence: 3,
      recalledSequence: 4,
      recordedAt: Date.parse('2026-03-02T09:00:00Z'),
      query: 'ok',
      typedQuery: 'ok',
      shownMessages: [],
      isSessionStart: false,
      sessionNumber: 1,
      isShredded: false,
      contextTokens: null,
      reply: 'Noted.',
      earlier: [],
      candidates: [
        { itemID: 'item-a', version: 2, isSelf: false, isPinned: true, isLapsed: false, isSensitive: false, text: 'Lives by the river' },
      ],
      logged: [],
      searchMode: 'hybrid',
      delivered: [],
      ratings: [],
    },
    { versions: new Map() },
    { ownerName: null, defaultZone: 'UTC' },
    [{ itemID: 'item-a', version: 1 }],
  );

  expect(tokens.pinnedChanges).toBe(109);
});

test('it counts no change note when the pinned core matches the turn before', () => {
  const tokens = buildBlockTokens(
    {
      caseID: 't5',
      stepSequence: 4,
      recalledSequence: 5,
      recordedAt: Date.parse('2026-03-02T09:00:00Z'),
      query: 'ok',
      typedQuery: 'ok',
      shownMessages: [],
      isSessionStart: false,
      sessionNumber: 1,
      isShredded: false,
      contextTokens: null,
      reply: 'Noted.',
      earlier: [],
      candidates: [
        { itemID: 'item-a', version: 2, isSelf: false, isPinned: true, isLapsed: false, isSensitive: false, text: 'Lives by the river' },
      ],
      logged: [],
      searchMode: 'hybrid',
      delivered: [],
      ratings: [],
    },
    { versions: new Map() },
    { ownerName: null, defaultZone: 'UTC' },
    [{ itemID: 'item-a', version: 2 }],
  );

  expect(tokens.pinnedChanges).toBe(0);
});
