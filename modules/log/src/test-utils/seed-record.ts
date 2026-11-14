import invariant from 'tiny-invariant';
import { writeRecords } from '../record/write-records';
import type { LogRecord, RecordInput } from '../types';
import type { LogSeederDeps } from './log-seeder-deps';

export async function seedRecord(
  deps: LogSeederDeps,
  input: Pick<RecordInput, 'kind'> & Partial<RecordInput>,
): Promise<LogRecord> {
  const [record] = await writeRecords(deps.log, [
    { definitions: { snapshotHash: 'sha256:test' }, ...input },
  ]);

  invariant(record, 'the write returns the record it made');

  return record;
}
