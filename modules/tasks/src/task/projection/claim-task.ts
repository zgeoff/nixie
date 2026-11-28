import type { RecordInput } from '@heynixie/log';
import { parseJSONObject, writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import { callRunnerKey } from '../../call/call-task-options';
import { buildGateFilter } from '../../gate/build-gate-filter';
import { claimLease } from '../../lease/claim-lease';
import { RunEndUnsettledError } from '../../run/run-end-unsettled-error';
import { settleRunEnd } from '../../run/settle-run-end';
import { writeRunOpenInTransaction } from '../../run/write-run-open-in-transaction';
import { buildCarriedWake } from '../../step/build-step-wake';
import { pickWakeSource } from '../../step/pick-wake-source';
import { taskStepStartedCodec } from '../../step/task-step-started-codec';
import type {
  ClaimCandidate,
  Lease,
  StartedClaim,
  StepWake,
  TasksContext,
  TasksTables,
} from '../../types';
import { resetLease } from '../../utils/reset-lease';
import { taskStepInterruptedCodec } from '../../utils/task-step-interrupted-codec';
import { buildPausedRecord } from '../record/build-paused-record';

type ClaimedTasks = 'started' | 'unstarted' | 'call';

export interface ClaimTaskOptions {
  readonly holder: string;
  readonly leaseMs: number;

  readonly tasks?: ClaimedTasks;

  readonly taskID?: string;
}

// A claim that would end an idle task run waits for no gateway: it claims nothing while a sandbox of
// that task run lacks its end read, and the next claim tries again.
export async function claimTask(
  context: TasksContext,
  options: ClaimTaskOptions,
): Promise<StartedClaim | null> {
  for (;;) {
    try {
      return await claimOnce(context, options);
    } catch (error) {
      if (!(error instanceof RunEndUnsettledError)) {
        throw error;
      }

      const settlement = await settleRunEnd(context, error.taskID);

      if (settlement === 'waiting') {
        return null;
      }
    }
  }
}

interface StartedStep {
  readonly stepKey: string;
  readonly wake: StepWake;
  readonly startSequence: number;
}

async function claimOnce(
  context: TasksContext,
  options: ClaimTaskOptions,
): Promise<StartedClaim | null> {
  const started: { step: StartedStep | null } = { step: null };

  const lease = await claimLease(context, {
    kind: 'task',
    holder: options.holder,
    durationMs: options.leaseMs,
    readCandidate: (tx, now) => readClaimableTask(tx, now, options),
    onClaim: async (tx, held) => {
      started.step = await writeStepStart(tx, context, held);
    },
  });

  return lease === null || started.step === null ? null : { lease, ...started.step };
}

async function readClaimableTask(
  tx: Transaction<unknown>,
  now: number,
  options: ClaimTaskOptions,
): Promise<ClaimCandidate | null> {
  const tasks = options.tasks ?? null;
  const taskID = options.taskID;

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
    .$if(tasks !== null, (query) =>
      query.where((eb) => {
        const isStarted = eb.or([
          eb('tasks.started_by', 'is not', null),
          eb('tasks.definition_id', 'is not', null),
        ]);

        // A call's task names its runner in its created record, so the call pool claims by it.
        const isCall = eb.exists(
          eb
            .selectFrom('records as created')
            .select('created.sequence')
            .whereRef('created.sequence', '=', 'tasks.created_sequence')
            .where(sql`json_extract(created.payload, '$.runner')`, '=', callRunnerKey),
        );

        return match(tasks)
          .with('call', () => isCall)
          .with('started', () => eb.and([isStarted, eb.not(isCall)]))
          .otherwise(() => eb.not(isStarted));
      }),
    )
    .where((eb) =>
      buildGateFilter(eb, 'task_claim', {
        taskID: sql.ref('tasks.task_id'),
        isStarted: sql.lit(0),
      }),
    )
    .where((eb) => (taskID === undefined ? eb.and([]) : eb('tasks.task_id', '=', taskID)))
    .orderBy('tasks.updated_sequence')
    .limit(1)
    .executeTakeFirst();

  return row === undefined ? null : { workID: row.task_id, taskID: row.task_id };
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
    .select(['sequence', 'kind', 'thread', 'payload'])
    .where('thread', '=', taskID)
    .where('sequence', '>', task.read_cursor)
    .orderBy('sequence')
    .execute();

  const unreadRecords = unread.map((record) => ({
    sequence: record.sequence,
    kind: record.kind,
    thread: record.thread,
    payload: parseJSONObject(record.payload),
  }));

  const source = pickWakeSource(unreadRecords);
  const wake = source?.wake ?? buildCarriedWake(task.step_hop);
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

  const opened =
    task.pause_requested === 1
      ? null
      : await writeRunOpenInTransaction(tx, context, { taskID, stepKey, unread: unreadRecords });

  if (task.pause_requested === 1 || opened === 'held') {
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
        ...(source === null ? {} : { source: source.record.sequence }),
      }),
    },
  ]);

  const start = records.at(-1);

  invariant(start, 'the step start writes its record');

  return { stepKey, wake, startSequence: start.sequence };
}
