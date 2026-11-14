import { expect, test } from 'bun:test';
import { parseMemoryEvents } from './parse-memory-events';

test('#parseMemoryEvents reads the oom_kill line of a full memory.events', () => {
  const text = 'low 0\nhigh 0\nmax 4\noom 2\noom_kill 2\noom_group_kill 0\n';

  expect(parseMemoryEvents(text)).toStrictEqual({ kind: 'count', kills: 2 });
});

test('#parseMemoryEvents reads a count of 0', () => {
  expect(parseMemoryEvents('oom_kill 0\n')).toStrictEqual({ kind: 'count', kills: 0 });
});

test('#parseMemoryEvents ignores oom_group_kill', () => {
  expect(parseMemoryEvents('oom 1\noom_group_kill 5\n')).toStrictEqual({ kind: 'unsupported' });
});

test('#parseMemoryEvents ignores a line that only ends in oom_kill and a number', () => {
  expect(parseMemoryEvents('xoom_kill 3\noom_kill 3 extra\n')).toStrictEqual({
    kind: 'unsupported',
  });
});

test('#parseMemoryEvents reports empty text as unsupported', () => {
  expect(parseMemoryEvents('')).toStrictEqual({ kind: 'unsupported' });
});
