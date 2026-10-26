import { createShortID } from '@heynixie/db';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { memoryWriterTaskID } from './memory-writer-task-id';
import { momentKeptCodec } from './moment-kept-codec';
import type { KeepMomentRequest, MomentContext, MomentWrite } from './moment-types';
import { probeThreadSpan } from './probe-thread-span';

export function writeKeptMoment(
  context: MomentContext,
  request: KeepMomentRequest,
): Promise<MomentWrite> {
  const caller = request.caller;

  if (caller.kind === 'model' && caller.thread === memoryWriterTaskID) {
    return Promise.resolve({ status: 'refused', reason: 'memory_writer' });
  }

  if (caller.kind === 'model' && caller.thread !== request.thread) {
    return Promise.resolve({ status: 'refused', reason: 'other_thread' });
  }

  return withWriteTransaction(context.log.writer, async (tx): Promise<MomentWrite> => {
    if (!(await probeThreadSpan(tx, request.thread, request))) {
      return { status: 'refused', reason: 'bad_span' };
    }

    const momentID = crypto.randomUUID();
    const shortID = createShortID();

    const [written] = await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'moment_kept',
        definitions: context.definitions(),
        ...(caller.kind === 'model' ? { thread: caller.thread } : {}),
        payload: momentKeptCodec.encode({
          momentID,
          shortID,
          thread: request.thread,
          firstSequence: request.firstSequence,
          lastSequence: request.lastSequence,
          keptBy: caller.kind,
          keptThread: caller.kind === 'model' ? caller.thread : null,
          model: caller.kind === 'model' ? caller.model : null,
        }),
        erasable: { title: request.title },
      },
    ]);

    invariant(written, 'the log wrote no record for the kept moment');

    return { status: 'written', momentID, shortID, version: 1, sequence: written.sequence };
  });
}
