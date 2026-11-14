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

test('it refuses a stored rule in the old names', () => {
  expect(() => parseRule({ id: 'ask-triage', outcome: 'ask', jobs: ['inbox-triage'] })).toThrow();
});

test('it refuses a stored rule with the old context job', () => {
  expect(() => parseRule({ id: 'ask-triage', outcome: 'ask', contexts: ['job'] })).toThrow();
});

test('it reads a stored rule in the new names', () => {
  const rule = parseRule({
    id: 'ask-triage',
    outcome: 'ask',
    contexts: ['task'],
    definitions: ['inbox-triage'],
  });

  expect(rule).toStrictEqual({
    id: 'ask-triage',
    outcome: 'ask',
    contexts: ['task'],
    definitions: ['inbox-triage'],
  });
});
