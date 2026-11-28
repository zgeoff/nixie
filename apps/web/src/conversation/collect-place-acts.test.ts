import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '../test-utils/build-mock-log-record';
import { collectPlaceActs } from './collect-place-acts';

test('it gathers one entry per place with a count for each tool, in the order of first use', () => {
  const acts = collectPlaceActs([
    buildMockLogRecord({
      kind: 'places.acted',
      placeActed: { place: 'tickets.example.com', tool: 'computer.browser_click' },
    }),
    buildMockLogRecord({
      kind: 'places.acted',
      placeActed: { place: 'sam@example.org', tool: 'mail.send' },
    }),
    buildMockLogRecord({
      kind: 'places.acted',
      placeActed: { place: 'tickets.example.com', tool: 'computer.browser_click' },
    }),
    buildMockLogRecord({
      kind: 'places.acted',
      placeActed: { place: 'tickets.example.com', tool: 'mail.send' },
    }),
  ]);

  expect(acts).toStrictEqual([
    {
      place: 'tickets.example.com',
      tools: [
        { tool: 'computer.browser_click', count: 2 },
        { tool: 'mail.send', count: 1 },
      ],
    },
    { place: 'sam@example.org', tools: [{ tool: 'mail.send', count: 1 }] },
  ]);
});

test('it shows nothing for an act record whose place a forget took', () => {
  expect(collectPlaceActs([buildMockLogRecord({ kind: 'places.acted' })])).toStrictEqual([]);
});
