import type { ImageTally } from './types';

// Whether a message's images would take the images already spent past the budget, in bytes or in
// count. A message with no images never passes it, even a budget already spent.
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
