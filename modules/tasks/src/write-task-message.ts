import { createShortID } from '@heynixie/db';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import type { StepRunRef } from './parse-step-run-id';
import { parseStepRunID } from './parse-step-run-id';
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

export interface TaskMessageWrite extends TaskMessageRequest {
  readonly stepRunID: string | null;
}

export function writeTaskMessage(
  context: Pick<TasksContext, 'clock' | 'definitions' | 'log'>,
  messaging: Pick<TaskMessaging, 'directory' | 'hopLimit'>,
  request: TaskMessageWrite,
): Promise<TaskMessageOutcome> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const step = request.stepRunID === null ? null : parseStepRunID(request.stepRunID);

    const senderHop =
      step === null ? null : await readLeasedStepHop(tx, request.from, step, context.clock.now());

    if (step === null || senderHop === null) {
      return { status: 'refused', refusal: { reason: 'stale_step' } };
    }

    const facts = await readFacts(tx, request, senderHop);

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
      plan.hold === 'hop_limit' && !(await probeNotice(tx, request, step.stepKey));

    if (isNoticeDue) {
      await writeRecordsInTransaction(tx, context.log, [
        {
          kind: 'task.exchange_limited',
          definitions,
          thread: request.from,
          payload: taskExchangeLimitedCodec.encode({
            messageID,
            stepKey: step.stepKey,
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

// The write transaction opens with BEGIN IMMEDIATE, so this check holds against every claim until
// the message commits.
async function readLeasedStepHop(
  tx: Transaction<unknown>,
  taskID: string,
  step: StepRunRef,
  now: number,
): Promise<number | null> {
  const row = await tx
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .innerJoin('leases', (join) =>
      join.onRef('leases.work_id', '=', 'tasks.task_id').on('leases.kind', '=', 'task'),
    )
    .select('tasks.step_hop')
    .where('tasks.task_id', '=', taskID)
    .where('tasks.started_step_key', '=', step.stepKey)
    .where('leases.generation', '=', step.generation)
    .where('leases.expires_at', '>', now)
    .executeTakeFirst();

  return row?.step_hop ?? null;
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
