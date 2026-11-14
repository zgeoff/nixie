import { expect, test } from 'bun:test';
import { buildOldRuleRow } from './build-old-rule-row';

test.each([
  {
    title: 'a task context with definitions',
    form: { id: 'r', outcome: 'ask', contexts: ['task'], definitions: ['d'] },
    old: { id: 'r', outcome: 'ask', contexts: ['job'], jobs: ['d'] },
  },
  {
    title: 'a task context alone',
    form: { id: 'r', outcome: 'ask', contexts: ['task'] },
    old: { id: 'r', outcome: 'ask', contexts: ['job', 'task'] },
  },
  {
    title: 'definitions alone',
    form: { id: 'r', outcome: 'ask', definitions: ['d'] },
    old: { id: 'r', outcome: 'ask', jobs: ['d'] },
  },
])('it writes $title in the old names', (row) => {
  expect(buildOldRuleRow(row.form)?.form).toStrictEqual(row.old);
});

test('it gives a rule with no new name no old row', () => {
  expect(buildOldRuleRow({ id: 'r', outcome: 'ask', contexts: ['conversation'] })).toBeNull();
});

test('it hashes the canonical JSON of the old form', () => {
  const hasher = new Bun.CryptoHasher('sha256');

  hasher.update('{"contexts":["job","task"],"id":"r","outcome":"ask"}');

  expect(buildOldRuleRow({ id: 'r', outcome: 'ask', contexts: ['task'] })?.hash).toBe(
    hasher.digest('hex'),
  );
});
