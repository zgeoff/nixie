import { expect, test } from 'bun:test';
import { buildStubAnswerTable } from './build-stub-answer-table.ts';

test('it answers each key with the answer the table holds for it', () => {
  const table = buildStubAnswerTable({ first: 'one', second: 'two' });

  expect([table.answer('second'), table.answer('first')]).toStrictEqual(['two', 'one']);
});

test('it resolves a run with the answer the table holds for its key', async () => {
  const table = buildStubAnswerTable({ first: 'one', second: 'two' });

  const answer = await table.run('second');

  expect(answer).toBe('two');
});

test('it refuses a key the table holds no answer for', () => {
  const table = buildStubAnswerTable<string, string>({ first: 'one' });

  expect(() => table.answer('second')).toThrow('the answer table holds no answer for second');
});

test('it rejects a run for a key the table holds no answer for', () => {
  const table = buildStubAnswerTable<string, string>({ first: 'one' });

  expect(table.run('second')).rejects.toThrow('the answer table holds no answer for second');
});
