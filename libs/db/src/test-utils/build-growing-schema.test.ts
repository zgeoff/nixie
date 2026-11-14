import { expect, test } from 'bun:test';
import { buildGrowingSchema } from './build-growing-schema';

test('it builds a schema with one migration per count', () => {
  const schema = buildGrowingSchema(3);

  expect(schema.migrations.map((migration) => migration.name)).toStrictEqual([
    'create table 0',
    'create table 1',
    'create table 2',
  ]);

  expect(schema.oldestReader).toBe(0);
});
