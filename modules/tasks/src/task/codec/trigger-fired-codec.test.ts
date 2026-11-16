import { expect, test } from 'bun:test';
import { triggerFiredCodec } from './trigger-fired-codec';

test('it decodes the payload a writer encodes', () => {
  const fire = {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'sha256:aaa',
    source: 'schedule',
    dedupeKey: 'water-the-tomatoes:2027-03-11T21:00:00.000Z',
    kind: 'schedule',
    scheduledFor: '2027-03-11T21:00:00.000Z',
    firedAt: '2027-03-11T21:00:01.000Z',
    isCatchUp: false,
    skipped: [],
    skippedCount: 0,
  } as const;

  expect(triggerFiredCodec.decode(triggerFiredCodec.encode(fire))).toStrictEqual(fire);
});

test('it refuses a kind the codec does not know', () => {
  expect(() =>
    triggerFiredCodec.decode({
      definitionID: 'water-the-tomatoes',
      definitionHash: 'sha256:aaa',
      source: 'webhook',
      dedupeKey: 'key-1',
      kind: 'webhook',
      scheduledFor: '2027-03-11T21:00:00.000Z',
      firedAt: '2027-03-11T21:00:01.000Z',
      isCatchUp: false,
      skipped: [],
      skippedCount: 0,
    }),
  ).toThrow(/"path": \[\s+"kind"\s+\]/u);
});
