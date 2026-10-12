import { expect, test } from 'bun:test';
import { buildMockProvenance } from './build-mock-provenance';

test('it builds a default provenance', () => {
  expect(buildMockProvenance()).toStrictEqual({
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockProvenance({ origin: 'task', taskID: 'task-3' })).toStrictEqual({
    origin: 'task',
    source: 'owner',
    taskID: 'task-3',
    proposalID: null,
    checks: null,
  });
});
