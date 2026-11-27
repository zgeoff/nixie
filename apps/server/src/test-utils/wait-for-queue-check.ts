import { waitForCondition } from '@heynixie/testing';
import type { TestRecord } from './types';

// Each start of nixie checks its action queue with an action of its own, which reaches every
// action fault point, so a test arms those points once this check is done.
export async function waitForQueueCheck(
  readRecords: () => Promise<readonly TestRecord[]>,
  timeoutMs: number,
): Promise<void> {
  await waitForCondition(
    async () => {
      const records = await readRecords();

      const started = records.findLast((record) => record.kind === 'server.started');

      return (
        started !== undefined &&
        records.some(
          (record) =>
            record.sequence > started.sequence &&
            record.kind === 'action.outcome' &&
            record.thread === 'queue-check',
        )
      );
    },
    { timeoutMs },
  );
}
