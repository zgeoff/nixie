import { expect, test } from 'bun:test';
import { pickMandate } from './pick-mandate';

function setupTest() {
  const hourMs = 60 * 60 * 1000;

  return {
    hourMs,
    facts: {
      mandateID: 'h7d2n5r9wb',
      now: Date.parse('2026-11-02T09:00:00Z'),
      zone: 'Australia/Sydney',
      maxHours: 24,
    },
    input: {
      title: 'Full authority over my calendar invites',
      rules: [
        { outcome: 'allow' as const, tools: ['calendar.respond'] },
        { outcome: 'allow' as const, tools: ['calendar.invite'] },
      ],
    },
  };
}

test('it ends the mandate at the next midnight of the zone by default', () => {
  const ctx = setupTest();
  const picked = pickMandate(ctx.input, ctx.facts);
  const end = picked.status === 'ok' ? new Date(picked.expires).toISOString() : picked.reason;

  expect(end).toBe('2026-11-02T13:00:00.000Z');
});

test('it gives each rule the mandate ID, its number and the end', () => {
  const ctx = setupTest();
  const picked = pickMandate(ctx.input, ctx.facts);

  expect(picked).toStrictEqual({
    status: 'ok',
    expires: Date.parse('2026-11-02T13:00:00Z'),
    rules: [
      {
        ruleID: 'h7d2n5r9wb-1',
        rule: {
          outcome: 'allow',
          tools: ['calendar.respond'],
          mandate: 'h7d2n5r9wb',
          expires: '2026-11-02T13:00:00.000Z',
        },
      },
      {
        ruleID: 'h7d2n5r9wb-2',
        rule: {
          outcome: 'allow',
          tools: ['calendar.invite'],
          mandate: 'h7d2n5r9wb',
          expires: '2026-11-02T13:00:00.000Z',
        },
      },
    ],
  });
});

test('it keeps the end that the input names', () => {
  const ctx = setupTest();
  const picked = pickMandate({ ...ctx.input, expires: '2026-11-02T21:00:00+11:00' }, ctx.facts);
  const end = picked.status === 'ok' ? picked.expires : null;

  expect(end).toBe(Date.parse('2026-11-02T10:00:00Z'));
});

test.each([
  ['at the time of the proposal', 'expires_past', '2026-11-02T09:00:00Z'],
  ['before the time of the proposal', 'expires_past', '2026-11-01T09:00:00Z'],
  ['one second beyond the longest mandate', 'expires_beyond_max', '2026-11-03T09:00:01Z'],
] as const)('it refuses an end %s', (_name, reason, expires) => {
  const ctx = setupTest();

  expect(pickMandate({ ...ctx.input, expires }, ctx.facts)).toStrictEqual({
    status: 'refused',
    reason,
  });
});

test('it takes the longest end that the setting allows', () => {
  const ctx = setupTest();
  const picked = pickMandate({ ...ctx.input, expires: '2026-11-03T09:00:00Z' }, ctx.facts);

  expect(picked.status).toBe('ok');
});

test('it refuses a default end beyond a shorter longest mandate', () => {
  const ctx = setupTest();
  const picked = pickMandate(ctx.input, { ...ctx.facts, maxHours: 2 });

  expect(picked).toStrictEqual({ status: 'refused', reason: 'expires_beyond_max' });
});
