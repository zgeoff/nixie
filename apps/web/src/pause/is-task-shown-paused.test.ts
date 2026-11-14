import { expect, test } from 'bun:test';
import { buildMockListedTask } from '../test-utils/build-mock-listed-task';
import { isTaskShownPaused } from './is-task-shown-paused';

test.each(['ready', 'running', 'waiting', 'paused'] as const)(
  'it shows a %s task as paused when nixie pauses it',
  (state) => {
    expect(isTaskShownPaused(buildMockListedTask({ isPausedByNixie: true, state }))).toBeTrue();
  },
);

test.each(['done', 'stopped', 'failed', 'closed'] as const)(
  'it shows a %s task as it is when nixie pauses it',
  (state) => {
    expect(isTaskShownPaused(buildMockListedTask({ isPausedByNixie: true, state }))).toBeFalse();
  },
);

test('it shows no task as paused when nixie runs', () => {
  expect(
    isTaskShownPaused(buildMockListedTask({ isPausedByNixie: false, state: 'waiting' })),
  ).toBeFalse();
});
