import { createShortID } from '@heynixie/db';
import { readRecords, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { conversationTaskID } from './conversation-task-id';
import { parseStepRunID } from './parse-step-run-id';
import { readLeasedStepHop } from './read-leased-step-hop';
import { taskCreatedCodec } from './task-created-codec';
import type { TasksContext, TasksTables } from './types';
import { writeTaskRouteInTransaction } from './write-task-route-in-transaction';

export interface TaskStartRequest {
  readonly from: string;
  readonly name: string;
  readonly brief: string;
  readonly stepRunID: string | null;
}

export type TaskStartRefusal =
  | { readonly reason: 'empty_name' }
  | { readonly reason: 'empty_brief' }
  | { readonly reason: 'stale_step' };

export type TaskStartOutcome =
  | { readonly status: 'started'; readonly taskID: string }
  | { readonly status: 'refused'; readonly refusal: TaskStartRefusal };

export async function writeTaskStart(
  context: Pick<TasksContext, 'clock' | 'definitions' | 'log'>,
  request: TaskStartRequest,
): Promise<TaskStartOutcome> {
  const name = request.name.trim();

  if (name === '') {
    return { status: 'refused', refusal: { reason: 'empty_name' } };
  }

  if (request.brief.trim() === '') {
    return { status: 'refused', refusal: { reason: 'empty_brief' } };
  }

  const step = request.stepRunID === null ? null : parseStepRunID(request.stepRunID);

  // The name is erasable, so the log keeps no copy of it outside its key: the match reads the
  // names before the write transaction, whose lease check then refuses a step that moved on.
  const earlier = step === null ? null : await readStartedTask(context, step.stepKey, name);

  return withWriteTransaction(context.log.writer, async (tx) => {
    const hop =
      step === null ? null : await readLeasedStepHop(tx, request.from, step, context.clock.now());

    if (step === null || hop === null) {
      return { status: 'refused', refusal: { reason: 'stale_step' } };
    }

    const taskID = earlier ?? createShortID();

    if (earlier === null) {
      await writeRecordsInTransaction(tx, context.log, [
        {
          kind: 'task.created',
          definitions: context.definitions(),
          thread: taskID,
          payload: taskCreatedCodec.encode({
            taskID,
            isConversation: false,
            state: 'ready',
            startedBy: request.from,
            startStep: step.stepKey,
          }),
          erasable: { name, brief: request.brief },
        },
      ]);
    }

    if (request.from === conversationTaskID) {
      await writeTaskRouteInTransaction(tx, context, {
        taskID,
        via: 'start',
        messageID: null,
        onBehalfOf: [],
      });
    }

    return { status: 'started', taskID };
  });
}

// A rerun of a step that crashed after its start committed calls the start again with the same
// name, and gets the task the first run started.
async function readStartedTask(
  context: Pick<TasksContext, 'log'>,
  stepKey: string,
  name: string,
): Promise<string | null> {
  const rows = await context.log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['task_id', 'created_sequence'])
    .where('start_step', '=', stepKey)
    .orderBy('created_sequence')
    .execute();

  if (rows.length === 0) {
    return null;
  }

  const created = await readRecords(context.log, {
    afterSequence: 0,
    sequences: rows.map((row) => row.created_sequence),
  });

  const match = created.find(
    (entry) =>
      entry.record.erasable.status === 'readable' && entry.record.erasable.fields['name'] === name,
  );

  return rows.find((row) => row.created_sequence === match?.record.sequence)?.task_id ?? null;
}
