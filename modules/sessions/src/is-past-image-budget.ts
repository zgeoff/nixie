import type { ImageTally } from './types';

export function isPastImageBudget(
  spent: ImageTally,
  added: ImageTally,
  budget: ImageTally,
): boolean {
  return (
    added.count > 0 &&
    (spent.bytes + added.bytes > budget.bytes || spent.count + added.count > budget.count)
  );
}
