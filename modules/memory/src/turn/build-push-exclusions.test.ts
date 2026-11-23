import { expect, test } from 'bun:test';
import { buildPushExclusions } from './build-push-exclusions';

test('it excludes a lapsed item, a pinned item and an item whose current version is held', () => {
  const states = [
    { itemID: 'lapsed', version: 1, isPinned: false, isSelf: false, isLapsed: true },
    { itemID: 'pinned', version: 1, isPinned: true, isSelf: false, isLapsed: false },
    { itemID: 'held', version: 2, isPinned: false, isSelf: false, isLapsed: false },
    { itemID: 'free', version: 1, isPinned: false, isSelf: false, isLapsed: false },
  ];

  const excluded = buildPushExclusions(states, [{ itemID: 'held', version: 2 }], []);

  expect(excluded).toStrictEqual(['lapsed', 'pinned', 'held']);
});

test('it keeps an item whose held version is no longer the current one', () => {
  const states = [
    { itemID: 'edited', version: 3, isPinned: false, isSelf: false, isLapsed: false },
  ];

  const excluded = buildPushExclusions(states, [{ itemID: 'edited', version: 2 }], []);

  expect(excluded).toStrictEqual([]);
});

test('it excludes an item that a write in the session touched, whatever version the session holds', () => {
  const states = [
    { itemID: 'written', version: 3, isPinned: false, isSelf: false, isLapsed: false },
    { itemID: 'free', version: 1, isPinned: false, isSelf: false, isLapsed: false },
  ];

  const excluded = buildPushExclusions(states, [], ['written']);

  expect(excluded).toStrictEqual(['written']);
});
