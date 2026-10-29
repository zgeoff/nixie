import { createShortID } from '@heynixie/db';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { conversationTaskID } from './conversation-task-id';
import { parseStepRunID } from './parse-step-run-id';
import { readLeasedStepHop } from './read-leased-step-hop';
import { taskCreatedCodec } from './task-created-codec';
import type { TasksContext } from './types';
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

export function writeTaskStart(
  context: Pick<TasksContext, 'clock' | 'definitions' | 'log'>,
  request: TaskStartRequest,
): Promise<TaskStartOutcome> {
  if (request.name.trim() === '') {
    return Promise.resolve({ status: 'refused', refusal: { reason: 'empty_name' } });
  }

  if (request.brief.trim() === '') {
    return Promise.resolve({ status: 'refused', refusal: { reason: 'empty_brief' } });
  }

  return withWriteTransaction(context.log.writer, async (tx) => {
    const step = request.stepRunID === null ? null : parseStepRunID(request.stepRunID);

    const hop =
      step === null ? null : await readLeasedStepHop(tx, request.from, step, context.clock.now());

    if (hop === null) {
      return { status: 'refused', refusal: { reason: 'stale_step' } };
    }

    const taskID = createShortID();

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
        }),
        erasable: { name: request.name.trim(), brief: request.brief },
      },
    ]);

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
