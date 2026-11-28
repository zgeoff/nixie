import { expect, test } from 'bun:test';
import { planSkillJoin } from './plan-skill-join';

test('it adds each listed skill the pin lacks at the version in force and keeps pinned versions', () => {
  const plan = planSkillJoin({
    pinned: [{ name: 'tide-tables', skillHash: 'old-hash', origin: 'definitions' }],
    inForce: {
      skills: [
        { name: 'bird-log', skillHash: 'bird-hash', origin: 'definitions' },
        { name: 'tide-tables', skillHash: 'new-hash', origin: 'definitions' },
      ],
    },
    list: ['bird-log', 'tide-tables'],
  });

  expect(plan).toStrictEqual({
    skills: [
      { name: 'bird-log', skillHash: 'bird-hash', origin: 'definitions' },
      { name: 'tide-tables', skillHash: 'old-hash', origin: 'definitions' },
    ],
    changes: [{ name: 'bird-log', oldHash: null, newHash: 'bird-hash' }],
  });
});

test('it joins nothing for a listed name that no skill in force carries', () => {
  const plan = planSkillJoin({
    pinned: [],
    inForce: { skills: [] },
    list: ['bird-log'],
  });

  expect(plan).toStrictEqual({ skills: [], changes: [] });
});
