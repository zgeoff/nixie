import { waitForCondition } from '../../libs/testing/src/index';
import type { MatchRecord, TestRecord } from './types';

// Waits for the first record that matches, reading the log each poll, and throws once timeoutMs
// passes without one.
export async function waitForMatch(
  readRecords: () => Promise<readonly TestRecord[]>,
  matches: MatchRecord,
  timeoutMs: number,
): Promise<TestRecord> {
  const found: { record: TestRecord | null } = { record: null };

  await waitForCondition(
    async () => {
      const records = await readRecords();

      found.record = records.find((record) => matches(record)) ?? null;
      return found.record !== null;
    },
    { timeoutMs },
  );
  if (found.record === null) {
    throw new Error('the wait found no record');
  }
  return found.record;
}
