import { expect, test } from 'bun:test';
import { formatLimit, formatSpendNotice } from './format-spend-notice';

test.each([
  ['dollars', 60, '$60'],
  ['dollars', 60.5, '$60.5'],
  ['tokens', 80_000_000, '80,000,000 tokens'],
  ['turns', 1000, '1,000 turns'],
] as const)('it words %s of %s as %s', (measure, limit, words) => {
  expect(formatLimit(measure, limit)).toBe(words);
});

test('it tells a day trip that it resumes at midnight and can be raised', () => {
  const notice = formatSpendNotice({
    state: 'tripped',
    period: 'day',
    start: '2026-11-13',
    measure: 'dollars',
    limit: 60,
    spent: 61.2,
    at: new Date('2026-11-13T16:42:07Z'),
    resetsAt: new Date('2026-11-14T00:00:00Z'),
    canRaise: true,
    limits: { dollars: 60, tokens: 80_000_000, turns: 1000 },
    used: { dollars: 61.2, tokens: 5, turns: 5 },
    cap: { dollars: 120, tokens: 160_000_000, turns: 2000 },
  });

  expect(notice).toMatch(
    /^Model spending stopped: the daily limit of \$60 was reached at \d{2}:\d{2}\. All tasks are paused where they were\. Nothing is lost\. Resumes on its own at midnight\.$/u,
  );
});

test('it says that only an operator raises a day limit that is at its cap', () => {
  const notice = formatSpendNotice({
    state: 'tripped',
    period: 'day',
    start: '2026-11-13',
    measure: 'turns',
    limit: 2000,
    spent: 2000,
    at: new Date('2026-11-13T16:42:07Z'),
    resetsAt: new Date('2026-11-14T00:00:00Z'),
    canRaise: false,
    limits: { dollars: 60, tokens: 80_000_000, turns: 2000 },
    used: { dollars: 5, tokens: 5, turns: 2000 },
    cap: { dollars: 120, tokens: 160_000_000, turns: 2000 },
  });

  expect(notice).toContain('only an operator raises it');
});

test('it names the month and its reset for a month trip', () => {
  const notice = formatSpendNotice({
    state: 'tripped',
    period: 'month',
    start: '2026-11-01',
    measure: 'dollars',
    limit: 600,
    spent: 600,
    at: new Date('2026-11-13T16:42:07Z'),
    resetsAt: new Date('2026-12-01T12:00:00Z'),
    canRaise: false,
    limits: { dollars: 600, tokens: 1, turns: 1 },
    used: { dollars: 600, tokens: 1, turns: 1 },
    cap: { dollars: 1200, tokens: 2, turns: 2 },
  });

  expect(notice).toMatch(
    /^Model spending stopped: the monthly limit of \$600 was reached\..+ Resumes on its own on .+, when the month resets\.$/u,
  );
});

test.each([
  ['unreachable', 'cannot reach the spending gateway'],
  ['lost', 'lost count'],
] as const)('it tells an operator what to do for a %s stop', (state, words) => {
  expect(formatSpendNotice({ state })).toContain(words);
});
