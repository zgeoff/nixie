import { expect, test } from 'bun:test';
import { formatProviderNotice } from './format-provider-notice';

function setupTest() {
  return {
    trip: {
      provider: 'main',
      routes: ['plan', 'metered'],
      period: 'day' as const,
      start: '2026-11-13',
      limit: 100,
      spent: 101.5,
      at: new Date('2026-11-13T16:42:07Z'),
      resetsAt: new Date('2026-11-14T00:00:00Z'),
      canRaise: true,
      cap: 200,
    },
  };
}

test('it names the provider and its routes and the limit in US dollars', () => {
  const ctx = setupTest();

  expect(formatProviderNotice(ctx.trip, null)).toBe(
    'Model spending paused on the provider main: its daily limit of $100.00 was reached. Work on every route of it (plan, metered) waits and nothing is lost. Routes of other providers go on. It resumes on its own at midnight.',
  );
});

test('it names the date that a month limit resets on', () => {
  const ctx = setupTest();

  const notice = formatProviderNotice(
    { ...ctx.trip, period: 'month', resetsAt: new Date('2026-12-01T00:00:00Z') },
    null,
  );

  expect(notice).toContain('its monthly limit of $100.00');
  expect(notice).toContain('It resumes on its own on ');
});
