import { expect, test } from 'bun:test';
import { parseBudgetFiles } from './parse-budget-files';

test('it parses each budget with its file, in dollars as millionths, sorted by ID', () => {
  const parsed = parseBudgetFiles(
    new Map([
      ['budgets/spend.yaml', 'shopping-month:\n  counts: spend\n  limit: 100\n  period: month\n'],
      [
        'budgets/tools.yaml',
        'search-day:\n  counts: tool:search\n  limit: 4.5\n  period: day\nmeals-week:\n  counts: spend\n  limit: 0.000001\n  period: week\n',
      ],
    ]),
  );

  expect(parsed).toStrictEqual({
    status: 'parsed',
    budgets: [
      {
        path: 'budgets/tools.yaml',
        budget: { id: 'meals-week', counts: 'spend', limitMicros: 1, period: 'week' },
      },
      {
        path: 'budgets/tools.yaml',
        budget: { id: 'search-day', counts: 'tool:search', limitMicros: 4_500_000, period: 'day' },
      },
      {
        path: 'budgets/spend.yaml',
        budget: {
          id: 'shopping-month',
          counts: 'spend',
          limitMicros: 100_000_000,
          period: 'month',
        },
      },
    ],
  });
});

test('it parses an empty budget file as no budgets', () => {
  expect(parseBudgetFiles(new Map([['budgets/empty.yaml', '# none yet\n']]))).toStrictEqual({
    status: 'parsed',
    budgets: [],
  });
});

test('it refuses a budget ID that 2 files define, naming both files', () => {
  const parsed = parseBudgetFiles(
    new Map([
      ['budgets/a.yaml', 'shopping-month:\n  counts: spend\n  limit: 100\n  period: month\n'],
      ['budgets/b.yaml', 'shopping-month:\n  counts: spend\n  limit: 50\n  period: month\n'],
    ]),
  );

  expect(parsed).toStrictEqual({
    status: 'refused',
    problems: [
      {
        path: 'budgets/b.yaml',
        reason:
          'the budget ID shopping-month is also in budgets/a.yaml, and an ID names one budget',
      },
    ],
  });
});

test.each([
  ['a limit of zero', 'x-day:\n  counts: spend\n  limit: 0\n  period: day\n', 'x-day.limit'],
  ['a negative limit', 'x-day:\n  counts: spend\n  limit: -5\n  period: day\n', 'x-day.limit'],
  ['an unknown period', 'x-day:\n  counts: spend\n  limit: 5\n  period: year\n', 'x-day.period'],
  [
    'counts that name nothing',
    'x-day:\n  counts: model\n  limit: 5\n  period: day\n',
    'x-day.counts',
  ],
  ['no period', 'x-day:\n  counts: spend\n  limit: 5\n', 'x-day.period'],
  ['an unknown field', 'x-day:\n  counts: spend\n  limit: 5\n  period: day\n  note: x\n', 'x-day'],
  ['an ID with capitals', 'X-Day:\n  counts: spend\n  limit: 5\n  period: day\n', 'X-Day'],
])('it refuses a budget with %s', (_label, text, field) => {
  const parsed = parseBudgetFiles(new Map([['budgets/x.yaml', text]]));

  expect(parsed).toMatchObject({
    status: 'refused',
    problems: [{ path: 'budgets/x.yaml', reason: expect.stringContaining(field) }],
  });
});

test('it refuses a file that is not YAML', () => {
  const parsed = parseBudgetFiles(new Map([['budgets/x.yaml', 'a: [unclosed']]));

  expect(parsed.status).toBe('refused');
});

test('it parses a budget whose ID holds the dot of a paid tool name', () => {
  const parsed = parseBudgetFiles(
    new Map([
      [
        'budgets/tools.yaml',
        'image.draw-day:\n  counts: tool:image.draw\n  limit: 3\n  period: day\n',
      ],
    ]),
  );

  expect(parsed).toStrictEqual({
    status: 'parsed',
    budgets: [
      {
        path: 'budgets/tools.yaml',
        budget: {
          id: 'image.draw-day',
          counts: 'tool:image.draw',
          limitMicros: 3_000_000,
          period: 'day',
        },
      },
    ],
  });
});
