import { expect, test } from 'bun:test';
import { pickRatingTurns } from './pick-rating-turns.ts';

test('it keeps every short turn and every turn shown an item, and fills the rest at random up to the size', () => {
  const turns = ['ok', 'when is the ferry?', 'book a table for four', 'which shoes for the hike?', 'how far is the lake?'].map(
    (query, position) => ({
      caseID: `t${position + 1}`,
      stepSequence: position * 10,
      recalledSequence: position * 10 + 1,
      recordedAt: 0,
      query,
      typedQuery: query,
      shownMessages: [],
      isSessionStart: false, sessionNumber: 0,
      isShredded: false,
      contextTokens: null,
      reply: '',
      earlier: [],
      candidates: [
        { itemID: 'item-a', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Takes the ferry' },
      ],
      logged: position === 1 ? [{ itemID: 'item-a', version: 1 }] : [],
      searchMode: 'hybrid',
      delivered: [],
      ratings: [],
    }),
  );

  const picked = pickRatingTurns(turns, 3, 3);

  expect({
    kept: picked.chosen.filter((turn) => turn.caseID === 't1' || turn.caseID === 't2').map((turn) => turn.caseID),
    count: picked.chosen.length,
    strata: picked.strata,
  }).toStrictEqual({ kept: ['t1', 't2'], count: 3, strata: { short: 1, shown: 1, random: 1 } });
});

test('it leaves out a turn whose retrieval ran on keywords alone', () => {
  const picked = pickRatingTurns(
    [
      {
        caseID: 't1',
        stepSequence: 0,
        recalledSequence: 1,
        recordedAt: 0,
        query: 'ok',
        typedQuery: 'ok',
        shownMessages: [],
        isSessionStart: false, sessionNumber: 0,
        isShredded: false,
        contextTokens: null,
        reply: '',
        earlier: [],
        candidates: [
          { itemID: 'item-a', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Takes the ferry' },
        ],
        logged: [],
        searchMode: 'keyword',
        delivered: [],
        ratings: [],
      },
    ],
    10,
    3,
  );

  expect(picked.chosen).toStrictEqual([]);
});

test('it leaves out a turn whose message or reply was shredded', () => {
  const picked = pickRatingTurns(
    [
      {
        caseID: 't1',
        stepSequence: 0,
        recalledSequence: 1,
        recordedAt: 0,
        query: 'ok',
        typedQuery: 'ok',
        shownMessages: [],
        isSessionStart: false, sessionNumber: 0,
        isShredded: true,
        contextTokens: null,
        reply: '',
        earlier: [],
        candidates: [
          { itemID: 'item-a', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Takes the ferry' },
        ],
        logged: [],
        searchMode: 'hybrid',
        delivered: [],
        ratings: [],
      },
    ],
    10,
    3,
  );

  expect(picked.chosen).toStrictEqual([]);
});
