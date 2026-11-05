import { expect, test } from 'bun:test';
import { buildTurnTokens } from './build-turn-tokens.ts';

test('it gives a turn that opened no session the pinned tokens it would show at an opening', () => {
  const tokens = buildTurnTokens(
    {
      caseID: 't9',
      stepSequence: 8,
      recalledSequence: 9,
      recordedAt: Date.parse('2026-03-02T09:00:00Z'),
      query: 'what about the boat?',
      typedQuery: 'what about the boat?',
      shownMessages: [],
      isSessionStart: false,
      sessionNumber: 2,
      isShredded: false,
      contextTokens: null,
      reply: 'Rope first.',
      earlier: [],
      candidates: [
        { itemID: 'item-a', version: 1, isSelf: false, isPinned: true, isLapsed: false, isSensitive: false, text: 'Lives by the canal' },
      ],
      logged: [],
      searchMode: 'hybrid',
      delivered: [],
      ratings: [],
    },
    { pinned: 0, pinnedChanges: 20, items: 40, selfNotes: 0, messages: 30 },
    { versions: new Map() },
    { ownerName: null, defaultZone: 'UTC' },
  );

  expect(tokens).toStrictEqual({ sessionNumber: 2, isSessionStart: false, added: 90, pinned: 85 });
});

test('it gives a turn that opened its session its own pinned tokens', () => {
  const tokens = buildTurnTokens(
    {
      caseID: 't9',
      stepSequence: 8,
      recalledSequence: 9,
      recordedAt: Date.parse('2026-03-02T09:00:00Z'),
      query: 'what about the boat?',
      typedQuery: 'what about the boat?',
      shownMessages: [],
      isSessionStart: true,
      sessionNumber: 2,
      isShredded: false,
      contextTokens: null,
      reply: 'Rope first.',
      earlier: [],
      candidates: [],
      logged: [],
      searchMode: 'hybrid',
      delivered: [],
      ratings: [],
    },
    { pinned: 60, pinnedChanges: 0, items: 40, selfNotes: 0, messages: 30 },
    { versions: new Map() },
    { ownerName: null, defaultZone: 'UTC' },
  );

  expect(tokens).toStrictEqual({ sessionNumber: 2, isSessionStart: true, added: 130, pinned: 60 });
});
