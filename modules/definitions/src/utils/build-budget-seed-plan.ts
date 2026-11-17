import type { RuleChange } from '@heynixie/policy';
import type { DefinitionBudget } from '../types';

// What a budget holds apart from its hash, which a built-in budget lacks
export type BudgetBase = Omit<DefinitionBudget, 'hash'>;

export interface BudgetEdit {
  readonly budgetID: string;
  readonly before: DefinitionBudget | null;
  readonly after: DefinitionBudget | null;
  readonly change: RuleChange;
}

export interface BudgetSeedPlan {
  // edits that apply at once: a new budget, a lowered limit and a removed budget
  readonly applied: readonly BudgetEdit[];

  // edits that wait in the seed's widening proposal: a raised limit, or another period or count
  readonly held: readonly BudgetEdit[];

  // the budgets in force once the applied edits land
  readonly inForce: readonly DefinitionBudget[];
}

export interface BudgetSeedInput {
  readonly definitions: readonly DefinitionBudget[];
  readonly inForce: readonly DefinitionBudget[];

  // the built-in budget of each paid tool, which a budget of the definitions with the same ID changes
  readonly builtIn: readonly BudgetBase[];
}

// A removed budget leaves no budget in force, so no lift names it and a paid tool falls back to its
// built-in limits: that narrows. A new budget narrows too, unless it raises a built-in limit.
export function buildBudgetSeedPlan(input: BudgetSeedInput): BudgetSeedPlan {
  const definitions = new Map(input.definitions.map((budget) => [budget.id, budget]));
  const inForce = new Map(input.inForce.map((budget) => [budget.id, budget]));
  const builtIn = new Map(input.builtIn.map((budget) => [budget.id, budget]));

  const applied: BudgetEdit[] = [];
  const held: BudgetEdit[] = [];

  for (const budgetID of [...new Set([...definitions.keys(), ...inForce.keys()])].toSorted()) {
    const stored = inForce.get(budgetID) ?? null;
    const after = definitions.get(budgetID) ?? null;

    if (stored?.hash === after?.hash) {
      continue;
    }

    const before = stored ?? builtIn.get(budgetID) ?? null;
    const edit = { budgetID, before: stored, after, change: pickBudgetChange(before, after) };

    if (edit.change === 'widening') {
      held.push(edit);
      continue;
    }

    applied.push(edit);

    if (after === null) {
      inForce.delete(budgetID);
    } else {
      inForce.set(budgetID, after);
    }
  }

  return {
    applied,
    held,
    inForce: [...inForce.values()].toSorted((left, right) => (left.id < right.id ? -1 : 1)),
  };
}

function pickBudgetChange(before: BudgetBase | null, after: BudgetBase | null): RuleChange {
  if (before === null || after === null) {
    return 'narrowing';
  }

  if (before.counts !== after.counts || before.period !== after.period) {
    return 'widening';
  }

  if (after.limitMicros === before.limitMicros) {
    return 'unchanged';
  }

  return after.limitMicros > before.limitMicros ? 'widening' : 'narrowing';
}
