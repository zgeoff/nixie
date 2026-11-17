import { expect, test } from 'bun:test';
import { buildMockGatewayStatus, buildMockPeriodStatus } from '../test-utils';
import { pickRaiseResend } from './pick-raise-resend';

test.each([
  { name: 'no raise', raise: null, limit: { dollars: 60, tokens: 80_000_000 }, expected: null },
  {
    name: 'a raise above the gateway limit in dollars',
    raise: { dollars: 90, tokens: 80_000_000, turns: 1, by: 'a' },
    limit: { dollars: 60, tokens: 80_000_000 },
    expected: { start: '2026-11-13', limit: { dollars: 90, tokens: 80_000_000 } },
  },
  {
    name: 'a raise above the gateway limit in tokens',
    raise: { dollars: 60, tokens: 90_000_000, turns: 1, by: 'a' },
    limit: { dollars: 60, tokens: 80_000_000 },
    expected: { start: '2026-11-13', limit: { dollars: 60, tokens: 90_000_000 } },
  },
  {
    name: 'a raise that the gateway holds',
    raise: { dollars: 90, tokens: 120_000_000, turns: 1, by: 'a' },
    limit: { dollars: 90, tokens: 120_000_000 },
    expected: null,
  },
  {
    name: 'a gateway with no limit',
    raise: { dollars: 90, tokens: 120_000_000, turns: 1, by: 'a' },
    limit: null,
    expected: null,
  },
])('it picks $name', (row) => {
  const status = buildMockGatewayStatus({
    periods: {
      day: buildMockPeriodStatus({ limit: row.limit }),
      month: buildMockPeriodStatus({ start: '2026-11-01' }),
    },
  });

  const resend = pickRaiseResend(
    { status, raise: row.raise, now: Date.parse('2026-11-13T16:42:07Z') },
    'UTC',
  );

  expect(resend).toStrictEqual(row.expected);
});

test('it sends no raise of a day that the gateway has left', () => {
  const resend = pickRaiseResend(
    {
      status: buildMockGatewayStatus(),
      raise: { dollars: 90, tokens: 120_000_000, turns: 1, by: 'a' },
      now: Date.parse('2026-11-14T00:00:01Z'),
    },
    'UTC',
  );

  expect(resend).toBeNull();
});
