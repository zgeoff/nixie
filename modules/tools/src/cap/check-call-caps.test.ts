import { expect, test } from 'bun:test';
import { checkCallCaps } from './check-call-caps';

test('it passes a cap on a listed tool', () => {
  expect(checkCallCaps({ 'web.fetch': 3 }, ['web.fetch', 'time.now'])).toStrictEqual([]);
});

test('it passes an empty map', () => {
  expect(checkCallCaps({}, [])).toStrictEqual([]);
});

test.each([0, -2, 1.5])('it refuses a cap of %p', (cap) => {
  expect(checkCallCaps({ 'web.fetch': cap }, ['web.fetch'])).toHaveLength(1);
});

test('it refuses a cap on a tool that tools lacks', () => {
  expect(checkCallCaps({ 'mail.send': 2 }, ['web.fetch'])).toHaveLength(1);
});

test('it reports one sentence for each failing cap', () => {
  expect(checkCallCaps({ 'mail.send': 2, 'web.fetch': 0 }, ['web.fetch'])).toHaveLength(2);
});
