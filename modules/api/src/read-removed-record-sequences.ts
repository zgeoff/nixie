import type { LogRecord } from '@heynixie/log';
import { readRemovedSequences } from '@heynixie/memory';
import type { APIContext } from './types';

export function readRemovedRecordSequences(
  context: Pick<APIContext, 'log'>,
  records: readonly LogRecord[],
): Promise<ReadonlySet<number>> {
  return readRemovedSequences(
    context.log.writer.db,
    records
      .filter((record) => record.erasable.status === 'shredded')
      .map((record) => record.sequence),
  );
}
