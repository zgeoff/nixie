import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { callHeardCutCodec } from '../record/call-heard-cut-codec';
import type { HeardCut } from './render-call-thread-line';

// The reply that a cut marks, split where the user stopped hearing it, or null for a record that
// marks no cut or a reply that a forget erased.
export async function readHeardCut(
  context: Pick<TasksContext, 'log'>,
  record: LogRecord,
): Promise<HeardCut | null> {
  if (record.kind !== 'call.heard_cut') {
    return null;
  }

  const cut = callHeardCutCodec.decode(record.payload);

  const [reply] = await readRecords(context.log, {
    afterSequence: 0,
    sequences: [Number(cut.replyRecordID)],
  });

  const text =
    reply?.record.erasable.status === 'readable' ? reply.record.erasable.fields['text'] : undefined;

  return typeof text === 'string'
    ? { heard: text.slice(0, cut.heardChars), unheard: text.slice(cut.heardChars) }
    : null;
}
