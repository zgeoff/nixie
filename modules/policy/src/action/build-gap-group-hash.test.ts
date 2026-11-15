import { expect, test } from 'bun:test';
import { buildGapGroupHash } from './build-gap-group-hash';

test('it hashes the same group alike whatever the order and duplicates of its destinations', () => {
  const first = buildGapGroupHash({
    tool: 'mail.send',
    context: 'task',
    destinations: ['sam@example.org', 'kim@example.org'],
  });

  const second = buildGapGroupHash({
    tool: 'mail.send',
    context: 'task',
    destinations: ['kim@example.org', 'sam@example.org', 'kim@example.org'],
  });

  expect(first).toBe(second);
});

test('it hashes destinations that differ only in Unicode form alike', () => {
  const composed = buildGapGroupHash({
    tool: 'mail.send',
    context: 'task',
    destinations: ['rené@example.org'],
  });

  const decomposed = buildGapGroupHash({
    tool: 'mail.send',
    context: 'task',
    destinations: ['rené@example.org'],
  });

  expect(composed).toBe(decomposed);
});

test.each([
  ['a tool variant', { tool: 'task.start/atc', context: 'task' as const, destinations: [] }],
  ['another context', { tool: 'task.start', context: 'conversation' as const, destinations: [] }],
  [
    'a destination',
    { tool: 'task.start', context: 'task' as const, destinations: ['a@example.org'] },
  ],
])('it hashes a group with %s apart from the plain one', (_name, key) => {
  const plain = buildGapGroupHash({ tool: 'task.start', context: 'task', destinations: [] });

  expect(buildGapGroupHash(key)).not.toBe(plain);
});
