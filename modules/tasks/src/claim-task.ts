import type { RecordInput } from '@heynixie/log';
import { parseJSONObject, writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { buildPausedRecord } from './build-paused-record';
import { buildStepWake } from './build-step-wake';
import { claimLease } from './claim-lease';
import { resetLease } from './reset-lease';
import { taskStepInterruptedCodec } from './task-step-interrupted-codec';
import { taskStepStartedCodec } from './task-step-started-codec';
import type { Lease, StartedClaim, StepWake, TasksContext, TasksTables } from './types';

export interface ClaimTaskOptions {
  readonly holder: string;
  readonly leaseMs: number;
}

interface StartedStep {
  readonly stepKey: string;
  readonly wake: StepWake;
  readonly startSequence: number;
}

export async function claimTask(
  context: TasksContext,
  options: ClaimTaskOptions,
): Promise<StartedClaim | null> {
  const started: { step: StartedStep | null } = { step: null };

  const lease = await claimLease(context, {
    kind: 'task',
    holder: options.holder,
    durationMs: options.leaseMs,
    readCandidate: readClaimableTask,
    onClaim: async (tx, held) => {
      started.step = await writeStepStart(tx, context, held);
    },
  });

  return lease === null || started.step === null ? null : { lease, ...started.step };
}

async function readClaimableTask(tx: Transaction<unknown>, now: number): Promise<string | null> {
  const row = await tx
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .leftJoin('leases', (join) =>
      join.on('leases.kind', '=', sql.lit('task')).onRef('leases.work_id', '=', 'tasks.task_id'),
    )
    .select('tasks.task_id')
    .where('tasks.claimable_at', '<=', now)
    .where('tasks.state', 'in', ['ready', 'running'])
    .where((eb) => eb.or([eb('leases.holder', 'is', null), eb('leases.expires_at', '<=', now)]))
    .orderBy('tasks.updated_sequence')
    .limit(1)
    .executeTakeFirst();

  return row?.task_id ?? null;
}

async function writeStepStart(
  tx: Transaction<unknown>,
  context: TasksContext,
  lease: Lease,
): Promise<StartedStep | null> {
  const taskID = lease.workID;
  const db = tx.$extendTables<TasksTables>();

  const task = await db
    .selectFrom('tasks')
    .select(['committed_steps', 'started_step_key', 'read_cursor', 'step_hop', 'pause_requested'])
    .where('task_id', '=', taskID)
    .executeTakeFirstOrThrow();

  const unread = await db
    .selectFrom('records')
    .select(['kind', 'thread', 'payload'])
    .where('thread', '=', taskID)
    .where('sequence', '>', task.read_cursor)
    .orderBy('sequence')
    .execute();

  const wake = buildStepWake(
    unread.map((record) => ({
      kind: record.kind,
      thread: record.thread,
      payload: parseJSONObject(record.payload),
    })),
    task.step_hop,
  );

  const stepKey = `${taskID}:${task.committed_steps + 1}`;
  const definitions = context.definitions();

  const interrupted: readonly RecordInput[] =
    task.started_step_key === null
      ? []
      : [
          {
            kind: 'task.step_interrupted',
            definitions,
            thread: taskID,
            payload: taskStepInterruptedCodec.encode({ taskID, stepKey: task.started_step_key }),
          },
        ];

  if (task.pause_requested === 1) {
    await writeRecordsInTransaction(tx, context.log, [
      ...interrupted,
      buildPausedRecord(taskID, 'ready', definitions),
    ]);

    await resetLease(tx, lease);

    return null;
  }

  const records = await writeRecordsInTransaction(tx, context.log, [
    ...interrupted,
    {
      kind: 'task.step_started',
      definitions,
      thread: taskID,
      payload: taskStepStartedCodec.encode({
        taskID,
        stepKey,
        generation: lease.generation,
        hop: wake.hop,
        cause: wake.cause,
      }),
    },
  ]);

  const start = records.at(-1);

  invariant(start, 'the step start writes its record');

  return { stepKey, wake, startSequence: start.sequence };
}
