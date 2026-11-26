import { spendRefusals } from './spend-refusals';

export function isSpendRefusal(error: unknown): boolean {
  return typeof error === 'object' && error !== null && spendRefusals.has(error);
}
