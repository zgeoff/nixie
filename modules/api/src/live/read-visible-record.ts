import type { LogRecord as ContractRecord } from '@heynixie/contract';
import { clipRecordPayloads } from '@heynixie/contract';
import type { LogRecord } from '@heynixie/log';
import { readAllRemovedSequences } from '@heynixie/memory';
import invariant from 'tiny-invariant';
import { toContractRecord } from '../contract/to-contract-record';
import { readRecordLookups } from '../record/read-record-lookups';
import type { APIContext } from '../types';

// One read of every removed sequence serves a replay of many removed records. A shredded record the
// read missed, because its forget started after the read, reads it again.
export interface RemovedSequences {
  held: ReadonlySet<number> | null;
}

interface VisibleOptions {
  readonly removed: RemovedSequences;
  readonly clipPayloads: boolean | undefined;
}

export async function readVisibleRecord(
  context: APIContext,
  record: LogRecord,
  options: VisibleOptions,
): Promise<ContractRecord> {
  const removed = options.removed;

  if (
    record.erasable.status === 'shredded' &&
    (removed.held === null || !removed.held.has(record.sequence))
  ) {
    removed.held = await readAllRemovedSequences(context.log.writer.db);
  }

  const known = removed.held === null ? {} : { removedSequences: removed.held };

  const lookups = await readRecordLookups(context, [record], known);

  const visible = toContractRecord(record, lookups);

  invariant(visible);

  return options.clipPayloads === true ? clipRecordPayloads(visible) : visible;
}
