import { expect, test } from 'bun:test';
import { buildTriggerKey } from './build-trigger-key';

test('it gives the same key for the same phrase', () => {
  expect(buildTriggerKey('bike pump')).toBe(buildTriggerKey('bike pump'));
});

test('it gives another key for another phrase', () => {
  expect(buildTriggerKey('bike pump')).not.toBe(buildTriggerKey('garden hose'));
});

test('it keeps no part of the phrase in the key', () => {
  expect(buildTriggerKey('bike pump')).toMatch(/^[0-9a-f]{16}$/u);
});
