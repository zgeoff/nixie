import type { RecordInput } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { claimLease } from './claim-lease';
import { taskStepInterruptedCodec } from './task-step-interrupted-codec';
import { taskStepStartedCodec } from './task-step-started-codec';
import type { Lease, TaskClaim, TasksContext, TasksTables } from './types';

export interface ClaimTaskOptions {
  readonly holder: string;
  readonly leaseMs: number;
}

export async function claimTask(
  context: TasksContext,
  options: ClaimTaskOptions,
): Promise<TaskClaim | null> {
  const started = { stepKey: '' };

  const lease = await claimLease(context, {
    kind: 'task',
    holder: options.holder,
    durationMs: options.leaseMs,
    readCandidate: readClaimableTask,
    onClaim: async (tx, held) => {
      started.stepKey = await writeStepStart(tx, context, held);
    },
  });

  return lease === null ? null : { lease, stepKey: started.stepKey };
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
): Promise<string> {
  const taskID = lease.workID;

  const task = await tx
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['committed_steps', 'started_step_key'])
    .where('task_id', '=', taskID)
    .executeTakeFirstOrThrow();

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

  await writeRecordsInTransaction(tx, context.log, [
    ...interrupted,
    {
      kind: 'task.step_started',
      definitions,
      thread: taskID,
      payload: taskStepStartedCodec.encode({ taskID, stepKey, generation: lease.generation }),
    },
  ]);

  return stepKey;
}
