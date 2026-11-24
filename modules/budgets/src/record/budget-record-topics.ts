import type { LiveTopic } from '@heynixie/log';
import type { BudgetRecordKind } from './budget-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const budgetRecordTopics = {
  'budget.charged': [],
  'budget.credited': [],
} as const satisfies Record<BudgetRecordKind, readonly LiveTopic[]>;
