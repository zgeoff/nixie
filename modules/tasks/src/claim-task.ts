import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { claimLease } from './claim-lease';
import type { Lease, TaskClaim, TasksContext, TasksTables } from './types';

export interface ClaimTaskOptions {
  readonly holder: string;
  readonly leaseMs: number;
}

// Claims the next task that has work: a ready task past its retry time, or a running task whose
// runner's lease expired. The claim records the step it starts.
export async function claimTask(
  context: TasksContext,
  options: ClaimTaskOptions,
): Promise<TaskClaim | null> {
  const started = { stepKey: '' };
  const lease = await claimLease(context, {
    kind: 'task',
    holder: options.holder,
    durationMs: options.leaseMs,
    findCandidate: findClaimableTask,
    onClaim: async (tx, held) => {
      started.stepKey = await writeStepStart(tx, context, held);
    },
  });

  return lease === null ? null : { lease, stepKey: started.stepKey };
}

async function findClaimableTask(tx: Transaction<unknown>, now: number): Promise<string | null> {
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

// Records the step the claim starts, keyed by the next step number, so a rerun of an interrupted
// step keeps its key. A step that the lost runner left without a commit is marked interrupted
// first.
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
  const interrupted =
    task.started_step_key === null
      ? []
      : [
          {
            kind: 'task.step_interrupted',
            definitions,
            thread: taskID,
            payload: { taskID, stepKey: task.started_step_key },
          },
        ];

  await writeRecordsInTransaction(tx, context.log, [
    ...interrupted,
    {
      kind: 'task.step_started',
      definitions,
      thread: taskID,
      payload: { taskID, stepKey, generation: lease.generation },
    },
  ]);
  return stepKey;
}
