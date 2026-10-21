import { expect, test } from 'bun:test';
import { z } from 'zod';
import { parseJSONObject } from './parse-json-object';

test('it parses a JSON object with its nested values', () => {
  expect(
    parseJSONObject('{"errand":"buy seeds","count":2,"tags":["garden",null],"done":false}'),
  ).toStrictEqual({ errand: 'buy seeds', count: 2, tags: ['garden', null], done: false });
});

test.each([
  ['an array', '[]'],
  ['null', 'null'],
  ['a string', '"buy seeds"'],
  ['a number', '7'],
])('it refuses JSON that holds %s', (_label, text) => {
  expect(() => parseJSONObject(text)).toThrow(z.ZodError);
});
