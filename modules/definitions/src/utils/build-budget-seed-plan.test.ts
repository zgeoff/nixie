import { expect, test } from 'bun:test';
import type { DefinitionBudget } from '../types';
import type { BudgetEdit } from './build-budget-seed-plan';
import { buildBudgetSeedPlan } from './build-budget-seed-plan';

test.each<[string, DefinitionBudget | null, DefinitionBudget | null, 'narrowing' | 'widening']>([
  [
    'a new budget',
    null,
    {
      id: 'shopping-month',
      counts: 'spend',
      limitMicros: 100_000_000,
      period: 'month',
      hash: 'h1',
    },
    'narrowing',
  ],
  [
    'a removed budget',
    {
      id: 'shopping-month',
      counts: 'spend',
      limitMicros: 100_000_000,
      period: 'month',
      hash: 'h1',
    },
    null,
    'narrowing',
  ],
  [
    'a lowered limit',
    {
      id: 'shopping-month',
      counts: 'spend',
      limitMicros: 100_000_000,
      period: 'month',
      hash: 'h1',
    },
    { id: 'shopping-month', counts: 'spend', limitMicros: 60_000_000, period: 'month', hash: 'h2' },
    'narrowing',
  ],
  [
    'a raised limit',
    {
      id: 'shopping-month',
      counts: 'spend',
      limitMicros: 100_000_000,
      period: 'month',
      hash: 'h1',
    },
    {
      id: 'shopping-month',
      counts: 'spend',
      limitMicros: 150_000_000,
      period: 'month',
      hash: 'h2',
    },
    'widening',
  ],
  [
    'another period',
    {
      id: 'shopping-month',
      counts: 'spend',
      limitMicros: 100_000_000,
      period: 'month',
      hash: 'h1',
    },
    { id: 'shopping-month', counts: 'spend', limitMicros: 60_000_000, period: 'week', hash: 'h2' },
    'widening',
  ],
  [
    'another thing counted',
    { id: 'search-day', counts: 'tool:search', limitMicros: 5_000_000, period: 'day', hash: 'h1' },
    { id: 'search-day', counts: 'spend', limitMicros: 5_000_000, period: 'day', hash: 'h2' },
    'widening',
  ],
])('it applies %s at once as a %s', (_label, before, after, change) => {
  const plan = buildBudgetSeedPlan({
    definitions: after === null ? [] : [after],
    inForce: before === null ? [] : [before],
    builtIn: [],
  });

  const budgetID = (before ?? after)?.id ?? '';
  const edit: BudgetEdit = { budgetID, before, after, change };

  expect(plan.applied).toStrictEqual([edit]);
});

test('it puts a raised budget limit in force', () => {
  const plan = buildBudgetSeedPlan({
    definitions: [
      {
        id: 'shopping-month',
        counts: 'spend',
        limitMicros: 150_000_000,
        period: 'month',
        hash: 'h2',
      },
    ],
    inForce: [
      {
        id: 'shopping-month',
        counts: 'spend',
        limitMicros: 100_000_000,
        period: 'month',
        hash: 'h1',
      },
    ],
    builtIn: [],
  });

  expect(plan.inForce).toStrictEqual([
    {
      id: 'shopping-month',
      counts: 'spend',
      limitMicros: 150_000_000,
      period: 'month',
      hash: 'h2',
    },
  ]);
});

test('it plans nothing for a budget that the definitions and the store hold alike', () => {
  const budget: DefinitionBudget = {
    id: 'shopping-month',
    counts: 'spend',
    limitMicros: 100_000_000,
    period: 'month',
    hash: 'h1',
  };

  expect(
    buildBudgetSeedPlan({ definitions: [budget], inForce: [budget], builtIn: [] }),
  ).toStrictEqual({
    applied: [],
    inForce: [budget],
  });
});

test('it applies a new budget that raises the built-in limit of a paid tool', () => {
  const plan = buildBudgetSeedPlan({
    definitions: [
      {
        id: 'search-day',
        counts: 'tool:search',
        limitMicros: 50_000_000,
        period: 'day',
        hash: 'h1',
      },
    ],
    inForce: [],
    builtIn: [{ id: 'search-day', counts: 'tool:search', limitMicros: 5_000_000, period: 'day' }],
  });

  expect(plan.applied.map((edit) => [edit.budgetID, edit.change])).toStrictEqual([
    ['search-day', 'widening'],
  ]);
});

test('it applies a new budget that lowers the built-in limit of a paid tool', () => {
  const plan = buildBudgetSeedPlan({
    definitions: [
      {
        id: 'search-day',
        counts: 'tool:search',
        limitMicros: 1_000_000,
        period: 'day',
        hash: 'h1',
      },
    ],
    inForce: [],
    builtIn: [{ id: 'search-day', counts: 'tool:search', limitMicros: 5_000_000, period: 'day' }],
  });

  expect(plan.applied.map((edit) => edit.budgetID)).toStrictEqual(['search-day']);
});
