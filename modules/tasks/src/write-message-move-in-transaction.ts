import { createShortID } from '@heynixie/db';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { isTakingOwnerMessages } from './is-taking-owner-messages';
import type { MessageMoveFacts, MessageMoveRefusal, MoveTarget } from './plan-message-move';
import { planMessageMove } from './plan-message-move';
import { taskCreatedCodec } from './task-created-codec';
import { taskMessageMovedCodec } from './task-message-moved-codec';
import { taskRouteCorrectedCodec } from './task-route-corrected-codec';
import type { TasksContext, TasksTables } from './types';
import { writeInboxRecordsInTransaction } from './write-inbox-records-in-transaction';

export interface MessageMoveRequest {
  readonly message: number;
  readonly thread: string;
  readonly to: MoveTarget;
}

export type MessageMoveOutcome =
  | { readonly status: 'moved'; readonly taskID: string }
  | { readonly status: 'refused'; readonly refusal: MessageMoveRefusal };

// The caller must hold the writer's write transaction, so the correction and both inbox records
// commit with its own rows.
export async function writeMessageMoveInTransaction(
  tx: Transaction<unknown>,
  context: Pick<TasksContext, 'definitions' | 'log'>,
  request: MessageMoveRequest,
): Promise<MessageMoveOutcome> {
  const facts = await readMoveFacts(tx, request);

  const plan = planMessageMove(request.to, facts);

  if (plan.status === 'refused') {
    return plan;
  }

  const definitions = context.definitions();
  const to = plan.target.kind === 'task' ? plan.target.taskID : createShortID();

  if (plan.target.kind === 'new') {
    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'task.created',
        definitions,
        thread: to,
        payload: taskCreatedCodec.encode({
          taskID: to,
          isConversation: false,
          state: 'ready',
          startedBy: 'owner',
        }),
        erasable: { name: plan.target.name.trim(), brief: plan.target.brief },
      },
    ]);
  }

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: 'task.route_corrected',
      definitions,
      thread: request.thread,
      payload: taskRouteCorrectedCodec.encode({ message: request.message, from: plan.from, to }),
    },
  ]);

  const moved = taskMessageMovedCodec.encode({
    message: request.message,
    messageThread: request.thread,
    from: plan.from,
    to,
  });

  await writeInboxRecordsInTransaction(tx, context, [
    ...(plan.isFromNotified
      ? [{ kind: 'task.message_moved' as const, definitions, thread: plan.from, payload: moved }]
      : []),
    { kind: 'task.message_moved', definitions, thread: to, payload: moved },
  ]);

  return { status: 'moved', taskID: to };
}

async function readMoveFacts(
  tx: Transaction<unknown>,
  request: MessageMoveRequest,
): Promise<MessageMoveFacts> {
  const db = tx.$extendTables<TasksTables>();

  const message = await db
    .selectFrom('records')
    .select('thread')
    .where('sequence', '=', request.message)
    .where('thread', '=', request.thread)
    .where('kind', '=', 'owner_message')
    .executeTakeFirst();

  const route = await db
    .selectFrom('message_routes')
    .select('task_id')
    .where('message_sequence', '=', request.message)
    .executeTakeFirst();

  const from = route?.task_id ?? request.thread;

  const fromTask = await db
    .selectFrom('tasks')
    .select('state')
    .where('task_id', '=', from)
    .executeTakeFirst();

  const target =
    request.to.kind === 'task'
      ? await db
          .selectFrom('tasks')
          .select(['state', 'is_conversation', 'started_by'])
          .where('task_id', '=', request.to.taskID)
          .executeTakeFirst()
      : undefined;

  return {
    messageThread: message?.thread ?? null,
    routedTo: route?.task_id ?? null,
    fromState: fromTask?.state ?? null,
    targetState: target?.state ?? null,
    isTargetTakingMessages: target === undefined ? true : isTakingOwnerMessages(target),
  };
}
