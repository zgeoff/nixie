import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { modelTurnEndedCodec } from '@heynixie/models';
import type { TasksContext } from '@heynixie/tasks';

// The wait notices in the inbox that a turn's opening told. Only a turn that ended after a notice
// was written can have told it, so the read starts at the oldest notice in the inbox.
export async function readToldWaitNotices(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
  inbox: readonly Pick<LogRecord, 'kind' | 'sequence'>[],
): Promise<ReadonlySet<number>> {
  const notices = inbox
    .filter((record) => record.kind === 'spend.wait_notice')
    .map((record) => record.sequence);

  if (notices.length === 0) {
    return new Set();
  }

  const entries = await readRecords(context.log, {
    afterSequence: Math.min(...notices),
    thread: taskID,
    kinds: ['model.turn_ended'],
  });

  const told = entries.flatMap(
    (entry) => modelTurnEndedCodec.tryDecodePartial(entry.record.payload)?.waitNoticesTold ?? [],
  );

  return new Set(told.filter((sequence) => notices.includes(sequence)));
}
