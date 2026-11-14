import { expect, test } from 'bun:test';
import { applyEffectOverride } from './apply-effect-override';

test('it adds an effect to the effects in code', () => {
  expect(
    applyEffectOverride('notes.write', ['write'], { add: ['send'], remove: [] }),
  ).toStrictEqual({
    status: 'applied',
    effects: ['send', 'write'],
  });
});

test('it removes an effect that the code holds', () => {
  expect(
    applyEffectOverride('mail.draft', ['send', 'write'], { add: [], remove: ['send'] }),
  ).toStrictEqual({ status: 'applied', effects: ['write'] });
});

test('it refuses a remove of an effect the code lacks', () => {
  expect(applyEffectOverride('mail.draft', ['write'], { add: [], remove: ['send'] })).toStrictEqual(
    {
      status: 'refused',
      reason: 'the override of mail.draft removes send, which the tool does not have',
    },
  );
});

test('it refuses an add of an effect the code holds', () => {
  expect(
    applyEffectOverride('mail.draft', ['write'], { add: ['write'], remove: [] }),
  ).toStrictEqual({
    status: 'refused',
    reason: 'the override of mail.draft adds write, which the tool already has',
  });
});
