import { expect, test } from 'bun:test';
import { parseEffectOverrides } from './parse-effect-overrides';

test('it reads the add and remove lists of each tool', () => {
  const parsed = parseEffectOverrides(
    new Map([['effects/mail.yaml', 'mail.draft:\n  add: [write]\n  remove: [send]\n']]),
  );

  expect(parsed).toStrictEqual({
    status: 'parsed',
    overrides: new Map([['mail.draft', { add: ['write'], remove: ['send'] }]]),
  });
});

test.each([
  ['an unknown effect', 'mail.draft:\n  add: [teleport]\n', 'add.0'],
  ['an override that changes nothing', 'mail.draft:\n  add: []\n', 'at least one effect'],
  [
    'an effect in both lists',
    'mail.draft:\n  add: [write]\n  remove: [write]\n',
    'both add and remove',
  ],
  ['an unknown key', 'mail.draft:\n  add: [write]\n  drop: [send]\n', 'drop'],
])('it refuses %s', (_label, text, reason) => {
  const parsed = parseEffectOverrides(new Map([['effects/mail.yaml', text]]));

  expect(parsed).toMatchObject({
    status: 'refused',
    problems: [{ path: 'effects/mail.yaml', reason: expect.stringContaining(reason) }],
  });
});

test('it refuses a tool that two files override', () => {
  const parsed = parseEffectOverrides(
    new Map([
      ['effects/a.yaml', 'mail.draft:\n  add: [write]\n'],
      ['effects/b.yaml', 'mail.draft:\n  add: [send]\n'],
    ]),
  );

  expect(parsed).toStrictEqual({
    status: 'refused',
    problems: [
      {
        path: 'effects/b.yaml',
        reason: 'the tool mail.draft is also in effects/a.yaml, and a tool has one override',
      },
    ],
  });
});
