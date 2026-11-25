import { expect, test } from 'bun:test';
import { buildMockSpendTrip } from '../test-utils/build-mock-spend-trip';
import { formatRouteNotice, formatSpendNotice } from './format-spend-notice';

test('it tells a day trip that it resumes at midnight and can be raised', () => {
  const notice = formatSpendNotice(buildMockSpendTrip());

  expect(notice).toMatch(
    /^Model spending stopped: the daily limit of 1,000 turns was reached at \d{2}:\d{2}\. All tasks are paused where they were\. Nothing is lost\. Resumes on its own at midnight\.$/u,
  );
});

test('it says that only an operator raises a day limit that is at its cap', () => {
  const notice = formatSpendNotice(buildMockSpendTrip({ canRaise: false }));

  expect(notice).toContain('only an operator raises it');
});

test('it names the month and its reset for a month trip', () => {
  const notice = formatSpendNotice(
    buildMockSpendTrip({
      period: 'month',
      start: '2026-11-01',
      limit: 20_000,
      resetsAt: new Date('2026-12-01T12:00:00Z'),
      canRaise: false,
    }),
  );

  expect(notice).toMatch(
    /^Model spending stopped: the monthly limit of 20,000 turns was reached\..+ Resumes on its own on .+, when the month resets\.$/u,
  );
});

test.each([
  ['unreachable', 'cannot reach the spending gateway'],
  ['lost', 'lost count'],
] as const)('it tells an operator what to do for a %s stop', (state, words) => {
  expect(formatSpendNotice({ state, routes: [] })).toContain(words);
});

test('it names the route that waits, says that other routes go on and gives no dollar figure', () => {
  const notice = formatRouteNotice({
    route: 'plan',
    period: 'day',
    start: '2026-11-13',
    limit: 40,
    spent: 41.2,
    at: new Date('2026-11-13T16:42:07Z'),
    resetsAt: new Date('2026-11-14T00:00:00Z'),
    canRaise: true,
    cap: 80,
  });

  expect(notice).toBe(
    'Model spending paused on plan: its daily limit was reached. Work on that route waits and nothing is lost. Other routes go on. It resumes on its own at midnight.',
  );
});
