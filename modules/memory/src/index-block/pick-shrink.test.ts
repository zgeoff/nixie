import { expect, test } from 'bun:test';
import { buildIndexRows } from '../test-utils/build-index-rows';
import { collectTopicRows } from './collect-topic-rows';
import { pickShrink } from './pick-shrink';

test('it folds a sub-topic of 1 item before the topic it sits in', () => {
  const states = collectTopicRows([
    ...buildIndexRows('people/family', 7, 1),
    ...buildIndexRows('people/friends', 1, 100),
  ]).map((row) => ({ row, isFolded: false, isDropped: false, foldedSubs: ['family'] }));

  const next = pickShrink(states);

  expect(next?.state.foldedSubs).toStrictEqual(['family', 'friends']);
  expect(next?.state.isFolded).toBe(false);
});

test('it folds the topic once every one of its sub-topics is folded', () => {
  const states = collectTopicRows([
    ...buildIndexRows('people/family', 7, 1),
    ...buildIndexRows('people/friends', 1, 100),
  ]).map((row) => ({ row, isFolded: false, isDropped: false, foldedSubs: ['family', 'friends'] }));

  expect(pickShrink(states)?.state.isFolded).toBe(true);
});

test('it folds a sub-topic of 8 items before a topic with none and 20', () => {
  const states = collectTopicRows([
    ...buildIndexRows('home', 20, 1),
    ...buildIndexRows('people/friends', 8, 100),
  ]).map((row) => ({ row, isFolded: false, isDropped: false, foldedSubs: [] }));

  const next = pickShrink(states);

  expect(next?.state.row.name).toBe('people');
  expect(next?.state.foldedSubs).toStrictEqual(['friends']);
});

test('it folds a topic with no sub-topic once no sub-topic is open', () => {
  const states = collectTopicRows(buildIndexRows('home', 20, 1)).map((row) => ({
    row,
    isFolded: false,
    isDropped: false,
    foldedSubs: [],
  }));

  expect(pickShrink(states)?.state.isFolded).toBe(true);
});

test('it drops the smallest topic once everything is folded', () => {
  const states = collectTopicRows([
    ...buildIndexRows('home', 20, 1),
    ...buildIndexRows('garden', 2, 100),
  ]).map((row) => ({ row, isFolded: true, isDropped: false, foldedSubs: [] }));

  const next = pickShrink(states);

  expect(next?.state.isDropped).toBe(true);
  expect(next?.state.row.name).toBe('garden');
});
