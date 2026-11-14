import { expect, test } from 'bun:test';
import { canSessionTake } from './can-session-take';

test.each([
  ['fresh', 'open'],
  ['summarized', 'open'],
  ['resumable', 'resume'],
  ['compaction-due', 'resume'],
  ['compaction-due', 'compact'],
  ['invalidated', 'open'],
  ['lost', 'open'],
] as const)('it lets a %s session take %s', (state, event) => {
  expect(canSessionTake(state, event)).toBe(true);
});

test.each([
  ['fresh', 'resume'],
  ['fresh', 'compact'],
  ['summarized', 'resume'],
  ['summarized', 'compact'],
  ['resumable', 'open'],
  ['resumable', 'compact'],
  ['compaction-due', 'open'],
  ['invalidated', 'resume'],
  ['invalidated', 'compact'],
  ['lost', 'resume'],
  ['lost', 'compact'],
] as const)('it refuses a %s session the %s event', (state, event) => {
  expect(canSessionTake(state, event)).toBe(false);
});
