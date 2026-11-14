import { expect, test } from 'bun:test';
import { planSkillReload } from './plan-skill-reload';

test('it moves one named skill to the version in force and keeps every other version', () => {
  expect(
    planSkillReload({
      pinned: [
        { name: 'bird-log', skillHash: 'hash-a', origin: 'definitions' },
        { name: 'tide-tables', skillHash: 'hash-b', origin: 'definitions' },
      ],
      inForce: {
        skills: [
          { name: 'bird-log', skillHash: 'hash-c', origin: 'definitions' },
          { name: 'tide-tables', skillHash: 'hash-d', origin: 'definitions' },
        ],
      },
      list: ['bird-log', 'tide-tables'],
      name: 'tide-tables',
    }),
  ).toStrictEqual({
    skills: [
      { name: 'bird-log', skillHash: 'hash-a', origin: 'definitions' },
      { name: 'tide-tables', skillHash: 'hash-d', origin: 'definitions' },
    ],
    changes: [{ name: 'tide-tables', oldHash: 'hash-b', newHash: 'hash-d' }],
  });
});

test('it moves every skill, adds one the list gained and drops one the definitions lost', () => {
  expect(
    planSkillReload({
      pinned: [
        { name: 'bird-log', skillHash: 'hash-a', origin: 'definitions' },
        { name: 'tide-tables', skillHash: 'hash-b', origin: 'definitions' },
      ],
      inForce: {
        skills: [
          { name: 'pdf-forms', skillHash: 'hash-e', origin: 'vendored' },
          { name: 'tide-tables', skillHash: 'hash-b', origin: 'definitions' },
        ],
      },
      list: ['pdf-forms', 'tide-tables'],
      name: null,
    }),
  ).toStrictEqual({
    skills: [
      { name: 'pdf-forms', skillHash: 'hash-e', origin: 'vendored' },
      { name: 'tide-tables', skillHash: 'hash-b', origin: 'definitions' },
    ],
    changes: [
      { name: 'bird-log', oldHash: 'hash-a', newHash: null },
      { name: 'pdf-forms', oldHash: null, newHash: 'hash-e' },
      { name: 'tide-tables', oldHash: 'hash-b', newHash: 'hash-b' },
    ],
  });
});

test('it leaves out a skill in force that the caller list lacks', () => {
  expect(
    planSkillReload({
      pinned: [],
      inForce: { skills: [{ name: 'pdf-forms', skillHash: 'hash-e', origin: 'vendored' }] },
      list: [],
      name: null,
    }),
  ).toStrictEqual({ skills: [], changes: [] });
});
