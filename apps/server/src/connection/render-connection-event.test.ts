import { expect, test } from 'bun:test';
import type { StatusEvent } from '@heynixie/connections';
import { renderConnectionEvent } from './render-connection-event';

function setupTest() {
  const base = {
    sequence: 10,
    atMs: Date.parse('2026-11-20T09:00:00Z'),
    who: {
      connection: 'k3x9m2p7qa',
      connector: 'google',
      label: 'Work',
      account: 'sam@example.com',
    },
  };

  return { base, render: (event: StatusEvent) => renderConnectionEvent(event, 'Europe/London') };
}

test('it renders a change into failing with its reason, its last success and where to reconnect', () => {
  const ctx = setupTest();

  const line = ctx.render({
    ...ctx.base,
    kind: 'changed',
    status: 'failing',
    reason: 'no_answer',
    lastSuccessAtMs: Date.parse('2026-11-20T08:30:00Z'),
    removedTools: [],
  });

  expect(line).toBe(
    'The google connection "Work" (sam@example.com) is now failing (no_answer). Last success Fri 20 Nov, 08:30, London. Reconnect it in Settings → Connections.',
  );
});

test('it renders a change into needs consent with the tools it removed and no last success', () => {
  const ctx = setupTest();

  const line = ctx.render({
    ...ctx.base,
    kind: 'changed',
    status: 'needs_consent',
    reason: null,
    lastSuccessAtMs: null,
    removedTools: ['gmail.search', 'gmail.read'],
  });

  expect(line).toBe(
    'The google connection "Work" (sam@example.com) is now needs consent. Last success none yet. Calls to these tools stop: gmail.search, gmail.read. Reconnect it in Settings → Connections.',
  );
});

test('it leaves the brackets out of a connection whose account holds no address', () => {
  const ctx = setupTest();

  const line = ctx.render({
    ...ctx.base,
    who: { ...ctx.base.who, account: '' },
    kind: 'lasted',
    sinceMs: Date.parse('2026-11-18T09:00:00Z'),
  });

  expect(line).toStartWith('The google connection "Work" has been broken since');
});

test.each([
  { failedCalls: 0, skippedRuns: 0, sentence: 'No call failed during the break.' },
  { failedCalls: 1, skippedRuns: 0, sentence: '1 call failed during the break.' },
  { failedCalls: 3, skippedRuns: 0, sentence: '3 calls failed during the break.' },
  {
    failedCalls: 2,
    skippedRuns: 1,
    sentence: '2 calls failed during the break. 1 job run ran without it.',
  },
  {
    failedCalls: 0,
    skippedRuns: 3,
    sentence: 'No call failed during the break. 3 job runs ran without it.',
  },
])('it renders a return after $failedCalls failed calls and $skippedRuns skipped runs', (row) => {
  const ctx = setupTest();

  const line = ctx.render({
    ...ctx.base,
    kind: 'returned',
    failedCalls: row.failedCalls,
    skippedRuns: row.skippedRuns,
  });

  expect(line).toBe(
    `The google connection "Work" (sam@example.com) is active again. ${row.sentence}`,
  );
});

test('it renders a break that lasted with the time it began', () => {
  const ctx = setupTest();

  const line = ctx.render({
    ...ctx.base,
    kind: 'lasted',
    sinceMs: Date.parse('2026-11-18T09:00:00Z'),
  });

  expect(line).toBe(
    'The google connection "Work" (sam@example.com) has been broken since Wed 18 Nov, 09:00, London. Tell the owner once, at a natural moment.',
  );
});
