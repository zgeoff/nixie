import { expect, test } from 'bun:test';
import { skillsReloadedCodec } from './skills-reloaded-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = skillsReloadedCodec.encode({
    skills: [{ name: 'tide-tables', skillHash: 'hash-b', origin: 'definitions' }],
    changes: [
      { name: 'tide-tables', oldHash: 'hash-a', newHash: 'hash-b' },
      { name: 'bird-log', oldHash: 'hash-c', newHash: null },
    ],
  });

  expect(skillsReloadedCodec.decode(payload)).toStrictEqual({
    skills: [{ name: 'tide-tables', skillHash: 'hash-b', origin: 'definitions' }],
    changes: [
      { name: 'tide-tables', oldHash: 'hash-a', newHash: 'hash-b' },
      { name: 'bird-log', oldHash: 'hash-c', newHash: null },
    ],
  });
});

test('it refuses a change with no new hash field', () => {
  expect(() =>
    skillsReloadedCodec.decode({
      skills: [],
      changes: [{ name: 'tide-tables', oldHash: 'hash-a' }],
    }),
  ).toThrow(/"newHash"/u);
});
