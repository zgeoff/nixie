import { expect, test } from 'bun:test';
import { isRecord } from './is-record';

test.each([
  ['an object', { model: 'model-small' }, true],
  ['null', null, false],
  ['an array', ['model-small'], false],
  ['text', 'model-small', false],
])('it answers %s with %p', (_label, value, expected) => {
  expect(isRecord(value)).toBe(expected);
});
