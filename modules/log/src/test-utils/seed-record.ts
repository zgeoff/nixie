import invariant from 'tiny-invariant';
import type { LogRecord, RecordInput } from '../types';
import { writeRecords } from '../write-records';
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
