import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import type { MatchRecord, TestRecord } from './types';

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

  invariant(found.record);

  return found.record;
}
