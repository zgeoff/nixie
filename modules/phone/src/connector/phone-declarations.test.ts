import { expect, test } from 'bun:test';
import { parsePlace } from '@heynixie/policy';
import { buildPolicyCall, buildTestDecisionPoint } from '@heynixie/policy/test-utils';
import { checkSendArguments } from './check-send-arguments';
import { phoneDeclarations } from './phone-declarations';

test.each(['+1234567', '+61455501234', '+123456789012345'])(
  'it reads the to of a send that the checks accept, %s, as a phone place',
  (to) => {
    expect({
      refusal: checkSendArguments({ to, body: 'On my way.' }),
      place: parsePlace(to),
    }).toStrictEqual({ refusal: null, place: { kind: 'phone', e164: to } });
  },
);

test('it reads a send to a number as a phone place, which a phone entry at act allows', async () => {
  const ctx = buildTestDecisionPoint({
    places: [{ id: 'p1', key: { kind: 'phone', e164: '+61455501234' }, trust: 'act' }],
    declaration: phoneDeclarations.send,
  });

  const decided = await ctx.decide(
    buildPolicyCall({
      tool: 'phone.send',
      toolList: ['phone.send'],
      args: { to: '+61455501234', body: 'On my way.' },
      destinations: [{ value: '+61455501234', replyTarget: false }],
    }),
  );

  expect(decided.decision).toStrictEqual({
    outcome: 'allow',
    stage: 7,
    rule: null,
    destinations: [
      { value: '+61455501234', permission: { by: 'place', placeID: 'p1', trust: 'act' } },
    ],
    places: [{ placeID: 'p1', shortID: 'short-p1' }],
    snapshot: 'snapshot-1',
  });
});
