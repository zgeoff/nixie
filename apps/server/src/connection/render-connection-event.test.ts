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

test('it renders a change into failing with its reason', () => {
  const ctx = setupTest();
  const line = ctx.render({ ...ctx.base, kind: 'changed', status: 'failing', reason: 'no_answer' });

  expect(line).toBe(
    'The google connection "Work" (sam@example.com) is now failing (no_answer) as of Fri 20 Nov, 09:00, London.',
  );
});

test('it renders a change into needs consent with no reason', () => {
  const ctx = setupTest();
  const line = ctx.render({ ...ctx.base, kind: 'changed', status: 'needs_consent', reason: null });

  expect(line).toBe(
    'The google connection "Work" (sam@example.com) is now needs consent as of Fri 20 Nov, 09:00, London.',
  );
});

test.each([
  { failedCalls: 0, sentence: 'No call failed during the break.' },
  { failedCalls: 1, sentence: '1 call failed during the break.' },
  { failedCalls: 3, sentence: '3 calls failed during the break.' },
])('it renders a return that counts $failedCalls failed calls', (row) => {
  const ctx = setupTest();
  const line = ctx.render({ ...ctx.base, kind: 'returned', failedCalls: row.failedCalls });

  expect(line).toBe(
    `The google connection "Work" (sam@example.com) is active again as of Fri 20 Nov, 09:00, London. ${row.sentence}`,
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
