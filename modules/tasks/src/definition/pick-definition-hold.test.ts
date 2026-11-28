import { expect, test } from 'bun:test';
import type { DefinitionHold, DefinitionHoldFacts } from './pick-definition-hold';
import { pickDefinitionHold } from './pick-definition-hold';

test.each<{ name: string; facts: DefinitionHoldFacts; expected: DefinitionHold | null }>([
  {
    name: 'a stopped task',
    facts: {
      state: 'stopped',
      holds: { ended: true, spend: false, nixie: false, limit: false, task: false },
      isPauseUnanswered: false,
    },
    expected: 'stopped',
  },
  {
    name: 'a task that the user paused',
    facts: {
      state: 'paused',
      holds: { ended: false, spend: false, nixie: false, limit: false, task: true },
      isPauseUnanswered: false,
    },
    expected: 'paused',
  },
  {
    name: 'a task at a limit',
    facts: {
      state: 'paused',
      holds: { ended: false, spend: false, nixie: false, limit: true, task: true },
      isPauseUnanswered: false,
    },
    expected: 'limit',
  },
  {
    name: 'a failed task whose pause request waited on its step',
    facts: {
      state: 'failed',
      holds: { ended: true, spend: false, nixie: false, limit: false, task: false },
      isPauseUnanswered: true,
    },
    expected: 'paused',
  },
  {
    name: 'a failed task that nothing else holds',
    facts: {
      state: 'failed',
      holds: { ended: true, spend: false, nixie: false, limit: false, task: false },
      isPauseUnanswered: false,
    },
    expected: null,
  },
  {
    name: 'a waiting task while nixie is paused',
    facts: {
      state: 'waiting',
      holds: { ended: false, spend: false, nixie: true, limit: false, task: false },
      isPauseUnanswered: false,
    },
    expected: null,
  },
])('it picks the hold of $name', (row) => {
  expect(pickDefinitionHold(row.facts)).toBe(row.expected);
});
