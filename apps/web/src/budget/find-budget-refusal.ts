import type { LiveRecord } from '../conversation/use-live-records';

const refusalPrefix = 'budget reached: ';

// The sentence of the last tool result when a budget refused that call, or null once a later call
// settled some other way.
export function findBudgetRefusal(records: readonly LiveRecord[]): string | null {
  const last = records.findLast((record) => record.toolCall?.outcome !== undefined);
  const message = last?.toolCall?.content?.['message'];

  return typeof message === 'string' && message.startsWith(refusalPrefix) ? message : null;
}
