import { expect, test } from 'bun:test';
import { mapATCState } from './map-atc-state';

test.each([
  { state: 'running', harness: 'running', expected: 'running' },
  { state: 'needs_you', harness: 'running', expected: 'waiting' },
  { state: 'done', harness: 'running', expected: 'idle' },
  { state: 'exited', harness: 'suspended', expected: 'gone' },
  { state: 'exited', harness: 'exited', expected: 'ended' },
  { state: 'exited', harness: undefined, expected: 'ended' },
  { state: 'paused_for_review', harness: 'running', expected: null },
])('it maps the atc state $state with harness $harness to $expected', (row) => {
  expect(mapATCState(row.state, row.harness)).toBe(row.expected);
});
