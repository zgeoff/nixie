import { expect, test } from 'bun:test';
import type { AttentionConnection } from '@heynixie/connections';
import { renderConnectionStatus } from './render-connection-status';

function setupTest() {
  const failing: AttentionConnection = {
    connection: 'k3x9m2p7qa',
    connector: 'google',
    label: 'Work',
    account: 'sam@example.com',
    status: 'failing',
    reason: 'service_error',
    sinceMs: Date.parse('2026-11-20T09:00:00Z'),
    lastSuccessAtMs: Date.parse('2026-11-20T08:30:00Z'),
    removedTools: [],
  };

  return {
    failing,
    render: (connections: readonly AttentionConnection[], expiresAtMs: number | null = null) =>
      renderConnectionStatus({
        connections,
        modelCredential: expiresAtMs === null ? null : { expiresAtMs },
        timeZone: 'Europe/London',
      }),
  };
}

test('it renders nothing while every connection is active', () => {
  const ctx = setupTest();

  expect(ctx.render([])).toBe('');
});

test('it lists a failing connection with its connector, label, account, status, reason, times and the place to reconnect', () => {
  const ctx = setupTest();
  const text = ctx.render([ctx.failing]);

  expect(text).toInclude(
    '- google connection "Work" (sam@example.com): failing (service_error) since Fri 20 Nov, 09:00, London; last success Fri 20 Nov, 08:30, London. Reconnect it in Settings → Connections.',
  );
});

test('it says there was no success when the connection has none', () => {
  const ctx = setupTest();
  const text = ctx.render([{ ...ctx.failing, lastSuccessAtMs: null }]);

  expect(text).toInclude('last success none yet.');
});

test('it names up to 5 of the tools a status removed, and counts the rest', () => {
  const ctx = setupTest();

  const text = ctx.render([
    {
      ...ctx.failing,
      status: 'needs_consent',
      reason: null,
      removedTools: ['a.one', 'a.two', 'a.three', 'a.four', 'a.five', 'a.six', 'a.seven'],
    },
  ]);

  expect(text).toInclude(
    'Calls to these tools stop: a.one, a.two, a.three, a.four, a.five, and 2 more.',
  );
});

test('it names every removed tool when there are 5 or fewer', () => {
  const ctx = setupTest();

  const text = ctx.render([
    { ...ctx.failing, status: 'needs_consent', reason: null, removedTools: ['a.one', 'a.two'] },
  ]);

  expect(text).toInclude('Calls to these tools stop: a.one, a.two.');
});

test('it adds the model credential when it is expiring', () => {
  const ctx = setupTest();
  const text = ctx.render([], Date.parse('2026-12-01T12:00:00Z'));

  expect(text).toInclude(
    '- The model credential: expiring on Tue 1 Dec, 12:00, London. Reconnect it in Settings → Connections.',
  );
});

test('it ends with the rule that says when to raise a status', () => {
  const ctx = setupTest();
  const text = ctx.render([ctx.failing]);

  expect(text).toInclude('Say each of these once per session.');
});
