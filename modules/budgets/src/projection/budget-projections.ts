import type { Projection } from '@heynixie/log';
import { budgetChargesProjection } from './budget-charges-projection';
import { spendLedgerProjection } from './spend-ledger-projection';

// The ledger folds before the charges: a credit reads its charge's row before the charges
// projection marks it.
export const budgetProjections: readonly Projection[] = [
  spendLedgerProjection,
  budgetChargesProjection,
];
