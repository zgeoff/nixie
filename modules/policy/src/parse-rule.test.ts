import { expect, test } from 'bun:test';
import { parseRule } from './parse-rule';

test('it parses a stored rule into its form', () => {
  const rule = parseRule({ id: 'allow-reads', outcome: 'allow', effects: ['read', 'fetch'] });

  expect(rule).toStrictEqual({ id: 'allow-reads', outcome: 'allow', effects: ['fetch', 'read'] });
});

test('it refuses a stored rule with a field the format lacks', () => {
  expect(() => parseRule({ id: 'allow-reads', outcome: 'allow', effect: ['read'] })).toThrow();
});

test('it refuses a stored rule without an ID', () => {
  expect(() => parseRule({ outcome: 'allow' })).toThrow();
});

test('it reads a rule that nixie stored in the old names', () => {
  const rule = parseRule({
    id: 'ask-triage',
    outcome: 'ask',
    contexts: ['job', 'task'],
    jobs: ['inbox-triage'],
  });

  expect(rule).toStrictEqual({
    id: 'ask-triage',
    outcome: 'ask',
    contexts: ['task'],
    definitions: ['inbox-triage'],
  });
});
