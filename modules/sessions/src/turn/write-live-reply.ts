import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { buildModelRecord, modelReplyCodec } from '@heynixie/models';
import type { StepInput } from '@heynixie/tasks';
import { requireLease, waitAtFaultPoint } from '@heynixie/tasks';
import type { ConversationRun } from '../types';

export interface LiveReply {
  readonly messageID: string;
  readonly text: string;

  // the reasoning summaries the model sent since its previous reply
  readonly summary: string;

  // the step run writing the reply, which a void of the reply names
  readonly runID: string;

  // the sequences of the inbox records the turn had read when it wrote the reply
  readonly readSequences: readonly number[];
}

// The reply sits on the thread the moment the host reads it, so a reader sees it while the turn
// runs. A runner that lost its lease writes nothing, and the lost lease ends the turn.
export async function writeLiveReply(
  run: Pick<ConversationRun, 'context' | 'model'>,
  input: Pick<StepInput, 'lease' | 'taskID'>,
  reply: LiveReply,
): Promise<number> {
  const context = run.context;

  const record = buildModelRecord(
    { definitions: context.definitions, model: run.model },
    modelReplyCodec,
    {
      payload: {
        messageID: reply.messageID,
        runID: reply.runID,
        ...(reply.readSequences.length === 0 ? {} : { readSequences: [...reply.readSequences] }),
      },
      text: reply.text,
      ...(reply.summary === '' ? {} : { summary: reply.summary }),
    },
  );

  const [written] = await withWriteTransaction(context.log.writer, async (tx) => {
    await requireLease(tx, input.lease, context.clock.now());

    return writeRecordsInTransaction(tx, context.log, [{ ...record, thread: input.taskID }]);
  });

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('turn.reply.after', { kind: 'task', id: input.taskID });
  }

  if (written === undefined) {
    throw new Error('the log wrote no reply record');
  }

  return written.sequence;
}
