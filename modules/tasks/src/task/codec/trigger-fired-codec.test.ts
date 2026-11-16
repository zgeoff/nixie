import { expect, test } from 'bun:test';
import { findLateBySeconds, parseTriggerFired } from './trigger-fired-codec';

function setupTest() {
  return {
    payload: {
      definitionID: 'call-the-dentist',
      definitionHash: 'hash-1',
      source: 'at',
      dedupeKey: 'key-1',
      kind: 'at',
      scheduledFor: '2026-03-09T03:00:00.000Z',
      firedAt: '2026-03-09T03:00:02.000Z',
      isCatchUp: false,
      skipped: [],
      skippedCount: 0,
    },
  };
}

test('it parses the payload of a fire', () => {
  const ctx = setupTest();

  expect(parseTriggerFired(ctx.payload)).toMatchObject({ kind: 'at', definitionHash: 'hash-1' });
});

test('it parses a poll fire, which its callers pass over', () => {
  const ctx = setupTest();

  expect(parseTriggerFired({ ...ctx.payload, kind: 'poll' })).toMatchObject({ kind: 'poll' });
});

test.each([['webhook'], [42]])('it parses a payload with the kind %p as null', (kind) => {
  const ctx = setupTest();

  expect(parseTriggerFired({ ...ctx.payload, kind })).toBeNull();
});

test('it gives no lateness to a fire on time', () => {
  const ctx = setupTest();

  expect(findLateBySeconds({ ...ctx.payload, isCatchUp: false })).toBeNull();
});

test('it gives the seconds between the set time and the arrival of a catch-up', () => {
  const ctx = setupTest();

  expect(
    findLateBySeconds({ ...ctx.payload, isCatchUp: true, firedAt: '2026-03-09T05:05:00.400Z' }),
  ).toBe(7500);
});
