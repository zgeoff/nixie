import { expect, test } from 'bun:test';
import { skillsPinnedCodec } from './skills-pinned-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = skillsPinnedCodec.encode({
    skills: [{ name: 'tide-tables', skillHash: 'hash-a', origin: 'definitions' }],
  });

  expect(skillsPinnedCodec.decode(payload)).toStrictEqual({
    skills: [{ name: 'tide-tables', skillHash: 'hash-a', origin: 'definitions' }],
  });
});

test('it refuses a skill of an origin other than the definitions or a vendored copy', () => {
  expect(() =>
    skillsPinnedCodec.decode({
      skills: [{ name: 'tide-tables', skillHash: 'hash-a', origin: 'registry' }],
    }),
  ).toThrow(/"origin"/u);
});
