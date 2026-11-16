import { expect, test } from 'bun:test';
import { triggerSkippedCodec } from './trigger-skipped-codec';

test('it decodes the payload a writer encodes', () => {
  const skip = {
    definitionID: 'water-the-tomatoes',
    source: 'schedule',
    dedupeKey: 'water-the-tomatoes:2027-03-11T21:00:00.000Z',
    scheduledFor: ['2027-03-11T21:00:00.000Z'],
    count: 1,
    reason: 'still_running',
    recordedAt: '2027-03-11T21:00:01.000Z',
  } as const;

  expect(triggerSkippedCodec.decode(triggerSkippedCodec.encode(skip))).toStrictEqual(skip);
});

test('it refuses a reason that is not a skip reason', () => {
  expect(() =>
    triggerSkippedCodec.decode({
      definitionID: 'water-the-tomatoes',
      source: 'schedule',
      dedupeKey: 'key-1',
      scheduledFor: [],
      count: 1,
      reason: 'bored',
      recordedAt: '2027-03-11T21:00:01.000Z',
    }),
  ).toThrow(/"path": \[\s+"reason"\s+\]/u);
});
