import { expect, test } from 'bun:test';
import type { Migration } from '../types';
import { buildSchemaBefore } from './build-schema-before';

test('it keeps the migrations that come before the one it is given', () => {
  const first: Migration = { name: 'first', up: () => Promise.resolve() };
  const second: Migration = { name: 'second', up: () => Promise.resolve() };
  const third: Migration = { name: 'third', up: () => Promise.resolve() };
  const schema = buildSchemaBefore({ migrations: [first, second, third], oldestReader: 2 }, third);

  expect(schema).toStrictEqual({ migrations: [first, second], oldestReader: 2 });
});
