import { expect, test } from 'bun:test';
import { buildSkillChanges } from './build-skill-changes';

test('it lists the skills a seed adds, changes and removes, each in name order', () => {
  const previous = [
    { name: 'tide-tables', skillHash: 'hash-a', origin: 'definitions' as const },
    { name: 'pdf-forms', skillHash: 'hash-b', origin: 'vendored' as const },
    { name: 'bird-log', skillHash: 'hash-c', origin: 'definitions' as const },
  ];

  const next = [
    { name: 'tide-tables', skillHash: 'hash-d', origin: 'definitions' as const },
    { name: 'pdf-forms', skillHash: 'hash-b', origin: 'vendored' as const },
    { name: 'seed-swap', skillHash: 'hash-e', origin: 'definitions' as const },
    { name: 'allotment', skillHash: 'hash-f', origin: 'definitions' as const },
  ];

  expect(buildSkillChanges(previous, next)).toStrictEqual({
    added: ['allotment', 'seed-swap'],
    changed: ['tide-tables'],
    removed: ['bird-log'],
  });
});

test('it lists every skill as added on the first seed', () => {
  expect(
    buildSkillChanges([], [{ name: 'tide-tables', skillHash: 'hash-a', origin: 'definitions' }]),
  ).toStrictEqual({ added: ['tide-tables'], changed: [], removed: [] });
});
