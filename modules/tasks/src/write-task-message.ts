import { createShortID } from '@heynixie/db';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import type {
  TaskMessageFacts,
  TaskMessageHold,
  TaskMessageRefusal,
  TaskMessageRequest,
} from './plan-task-message';
import { planTaskMessage } from './plan-task-message';
import { taskExchangeLimitedCodec } from './task-exchange-limited-codec';
import { taskMessageCodec } from './task-message-codec';
import { toEventID } from './to-event-id';
import type { TaskMessaging, TasksContext, TasksTables } from './types';
import { writeInboxRecordsInTransaction } from './write-inbox-records-in-transaction';

export type TaskMessageOutcome =
  | {
      readonly status: 'sent';
      readonly messageID: string;
      readonly hop: number;
      readonly woke: boolean;
      readonly hold: TaskMessageHold;
    }
  | { readonly status: 'refused'; readonly refusal: TaskMessageRefusal };

export function writeTaskMessage(
  context: Pick<TasksContext, 'definitions' | 'log'>,
  messaging: Pick<TaskMessaging, 'directory' | 'hopLimit'>,
  request: TaskMessageRequest,
): Promise<TaskMessageOutcome> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const sender = await readSender(tx, request.from);
    const facts = await readFacts(tx, request, sender.hop);

    const plan = planTaskMessage(request, facts, messaging);

    if (plan.status === 'refused') {
      return plan;
    }

    const messageID = createShortID();
    const definitions = context.definitions();

    await writeInboxRecordsInTransaction(tx, context, [
      {
        kind: 'task_message',
        definitions,
        thread: request.to,
        payload: taskMessageCodec.encode({
          messageID,
          from: request.from,
          to: request.to,
          kind: request.kind,
          replyTo: request.replyTo,
          onBehalfOf: [...plan.onBehalfOf],
          hop: plan.hop,
          hopLimit: messaging.hopLimit,
          wake: request.wake,
          woke: plan.woke,
          source: `task:${request.from}`,
        }),
        erasable: { body: request.body },
      },
    ]);

    const isNoticeDue =
      plan.hold === 'hop_limit' && !(await probeNotice(tx, request, sender.stepKey));

    if (isNoticeDue) {
      await writeRecordsInTransaction(tx, context.log, [
        {
          kind: 'task.exchange_limited',
          definitions,
          thread: request.from,
          payload: taskExchangeLimitedCodec.encode({
            messageID,
            stepKey: sender.stepKey,
            from: request.from,
            to: request.to,
            hops: plan.hop - 1,
            waiting: await readOpenWait(tx, request.from, request.to),
          }),
        },
      ]);
    }

    return { status: 'sent', messageID, hop: plan.hop, woke: plan.woke, hold: plan.hold };
  });
}

interface Sender {
  readonly hop: number;
  readonly stepKey: string;
}

async function readSender(tx: Transaction<unknown>, taskID: string): Promise<Sender> {
  const row = await tx
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['step_hop', 'started_step_key'])
    .where('task_id', '=', taskID)
    .executeTakeFirstOrThrow();

  if (row.started_step_key === null) {
    throw new Error(`task ${taskID} sent a message outside a step`);
  }

  return { hop: row.step_hop, stepKey: row.started_step_key };
}

async function readFacts(
  tx: Transaction<unknown>,
  request: TaskMessageRequest,
  senderHop: number,
): Promise<TaskMessageFacts> {
  const db = tx.$extendTables<TasksTables>();

  const receiver = await db
    .selectFrom('tasks')
    .select('state')
    .where('task_id', '=', request.to)
    .executeTakeFirst();

  const reply =
    request.replyTo === null
      ? undefined
      : await db
          .selectFrom('task_messages')
          .select('message_id')
          .where('message_id', '=', request.replyTo)
          .where('to_task', '=', request.from)
          .executeTakeFirst();

  const sequences = request.onBehalfOf
    .map((eventID) => Number(toEventID(eventID)))
    .filter((sequence) => Number.isSafeInteger(sequence));

  const owned =
    sequences.length === 0
      ? []
      : await db
          .selectFrom('records')
          .select('sequence')
          .where('sequence', 'in', sequences)
          .where('kind', '=', 'owner_message')
          .execute();

  return {
    senderHop,
    receiverState: receiver?.state ?? null,
    isReplyToKnown: reply !== undefined,
    ownerMessageIDs: new Set(owned.map((row) => String(row.sequence))),
  };
}

async function probeNotice(
  tx: Transaction<unknown>,
  request: TaskMessageRequest,
  stepKey: string,
): Promise<boolean> {
  const notice = await tx
    .$extendTables<TasksTables>()
    .selectFrom('records')
    .select('sequence')
    .where('kind', '=', 'task.exchange_limited')
    .where('thread', '=', request.from)
    .where(sql`json_extract(payload, '$.stepKey')`, '=', stepKey)
    .where(sql`json_extract(payload, '$.to')`, '=', request.to)
    .executeTakeFirst();

  return notice !== undefined;
}

async function readOpenWait(
  tx: Transaction<unknown>,
  first: string,
  second: string,
): Promise<{ readonly taskID: string; readonly onTaskID: string } | null> {
  const wait = await tx
    .$extendTables<TasksTables>()
    .selectFrom('task_messages')
    .select(['from_task', 'to_task'])
    .where('wait_state', '=', 'open')
    .where((eb) =>
      eb.or([
        eb.and([eb('from_task', '=', first), eb('to_task', '=', second)]),
        eb.and([eb('from_task', '=', second), eb('to_task', '=', first)]),
      ]),
    )
    .orderBy('sent_sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  return wait === undefined ? null : { taskID: wait.from_task, onTaskID: wait.to_task };
}
