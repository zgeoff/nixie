import { expect, test } from 'bun:test';
import type { TaskHolds, TaskState } from '../types';
import type { DefinitionFire } from './pick-definition-fire';
import { pickDefinitionFire } from './pick-definition-fire';

test.each<[string, TaskState, TaskHolds, DefinitionFire]>([
  [
    'a failed task that nothing else holds',
    'failed',
    { ended: true, spend: false, nixie: false, limit: false, task: false },
    'revive',
  ],
  [
    'a failed task at a limit',
    'failed',
    { ended: true, spend: false, nixie: false, limit: true, task: false },
    'held',
  ],
  [
    'a failed task that its owner paused',
    'failed',
    { ended: true, spend: false, nixie: false, limit: false, task: true },
    'held',
  ],
  [
    'a failed task while nixie is paused',
    'failed',
    { ended: true, spend: false, nixie: true, limit: false, task: false },
    'wait',
  ],
  [
    'a failed task while the spending stop stands',
    'failed',
    { ended: true, spend: true, nixie: false, limit: false, task: false },
    'wait',
  ],
  [
    'a stopped task while nixie is paused',
    'stopped',
    { ended: true, spend: false, nixie: true, limit: false, task: false },
    'held',
  ],
  [
    'a waiting task that nothing holds',
    'waiting',
    { ended: false, spend: false, nixie: false, limit: false, task: false },
    'take',
  ],
])('it answers for %s', (_, state, holds, expected) => {
  const result = pickDefinitionFire({
    holds,
    state,
    run: {
      open: null,
      isLimitHeld: false,
      control: null,
      newest: null,
      fires: [],
      heldKeys: new Set(),
      waking: null,
      hashInForce: 'hash-1',
    },
    isPauseUnanswered: false,
  });

  expect(result).toBe(expected);
});

test('it answers held for a failed task whose pause request waited on the step that failed it', () => {
  const result = pickDefinitionFire({
    holds: { ended: true, spend: false, nixie: false, limit: false, task: false },
    state: 'failed',
    run: {
      open: null,
      isLimitHeld: false,
      control: null,
      newest: null,
      fires: [],
      heldKeys: new Set(),
      waking: null,
      hashInForce: 'hash-1',
    },
    isPauseUnanswered: true,
  });

  expect(result).toBe('held');
});
