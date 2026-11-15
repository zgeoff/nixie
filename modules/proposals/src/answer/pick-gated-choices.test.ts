import { expect, test } from 'bun:test';
import { pickGatedChoices } from './pick-gated-choices';

test.each(['always_ask', 'lifting'] as const)(
  'it gates approve and always allow of a %s row, and never defer or decline',
  (riskClass) => {
    const gated = pickGatedChoices(riskClass, ['approve', 'always_allow', 'defer', 'decline']);

    expect(gated).toStrictEqual(['approve', 'always_allow']);
  },
);

test('it gates nothing of a routine row', () => {
  const gated = pickGatedChoices('routine', ['approve', 'always_allow', 'defer', 'decline']);

  expect(gated).toStrictEqual([]);
});
