import { expect, test } from 'bun:test';
import type { SendEvidence } from './pick-send-settlement';
import { pickSendSettlement } from './pick-send-settlement';

function setupTest() {
  const evidence: SendEvidence = {
    request: { to: '+61400000000', body: 'Running late.' },
    attemptStartedAt: 10_000,
    candidates: [],
    claimedMessageIDs: [],
    open: [],
  };

  return { evidence };
}

test.each<[string, Partial<SendEvidence>, ReturnType<typeof pickSendSettlement>]>([
  ['finds no text', {}, { kind: 'not_found' }],
  [
    'claims the one text that the provider created after the attempt began',
    { candidates: [{ messageID: 'SM1', createdAt: 10_500, precisionMs: 1 }] },
    { kind: 'claim', messageID: 'SM1' },
  ],
  [
    'claims a text that the provider created in the second the attempt began',
    { candidates: [{ messageID: 'SM1', createdAt: 9500, precisionMs: 1000 }] },
    { kind: 'claim', messageID: 'SM1' },
  ],
  [
    'asks about a text that the provider created before the attempt began',
    { candidates: [{ messageID: 'SM1', createdAt: 9000, precisionMs: 1 }] },
    { kind: 'inconclusive' },
  ],
  [
    'asks about 2 unclaimed texts',
    {
      candidates: [
        { messageID: 'SM1', createdAt: 10_100, precisionMs: 1 },
        { messageID: 'SM2', createdAt: 10_200, precisionMs: 1 },
      ],
    },
    { kind: 'inconclusive' },
  ],
  [
    'asks about a text that another send claimed',
    {
      candidates: [{ messageID: 'SM1', createdAt: 10_100, precisionMs: 1 }],
      claimedMessageIDs: ['SM1'],
    },
    { kind: 'inconclusive' },
  ],
  [
    'claims the unclaimed one of 2 texts when the other has a claim',
    {
      candidates: [
        { messageID: 'SM1', createdAt: 10_100, precisionMs: 1 },
        { messageID: 'SM2', createdAt: 10_200, precisionMs: 1 },
      ],
      claimedMessageIDs: ['SM1'],
    },
    { kind: 'claim', messageID: 'SM2' },
  ],
  [
    'asks when another begun send has the same number and body',
    {
      candidates: [{ messageID: 'SM1', createdAt: 10_100, precisionMs: 1 }],
      open: [{ to: '+61400000000', body: 'Running late.' }],
    },
    { kind: 'inconclusive' },
  ],
  [
    'claims when the other begun send has another body',
    {
      candidates: [{ messageID: 'SM1', createdAt: 10_100, precisionMs: 1 }],
      open: [{ to: '+61400000000', body: 'Another text.' }],
    },
    { kind: 'claim', messageID: 'SM1' },
  ],
])('#pickSendSettlement %s', (_name, overrides, expected) => {
  const ctx = setupTest();

  expect(pickSendSettlement({ ...ctx.evidence, ...overrides })).toStrictEqual(expected);
});
