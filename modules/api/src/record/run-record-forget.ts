import { withWriteTransaction } from '@heynixie/log';
import type { APIContext } from '../types';
import { readRecordStartCalls } from './read-record-start-calls';
import { runRecordForgetCleanup } from './run-record-forget-cleanup';
import type { RecordForgetStart } from './write-record-forget-start';
import { writeRecordForgetStart } from './write-record-forget-start';

interface RecordTarget {
  readonly thread: string;
  readonly sequence: number;
}

// Forgets one record and runs its cleanup, with no check of who asks. Run again after a completed
// forget, it answers forgotten and changes nothing.
export async function runRecordForget(
  context: APIContext,
  target: RecordTarget,
): Promise<RecordForgetStart> {
  const startCalls = await readRecordStartCalls(context, target.sequence);

  const start = await withWriteTransaction(context.log.writer, (tx) =>
    writeRecordForgetStart(tx, context, target, startCalls),
  );

  if (start.status === 'forgotten') {
    await runRecordForgetCleanup(context, target.sequence);
  }

  return start;
}
