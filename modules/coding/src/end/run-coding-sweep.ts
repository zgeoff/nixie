import type { ActionsTables } from '@heynixie/actions';
import { readRecords, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { RunnerEndCause, RunnerEndCommit, TasksTables } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { codingToolNames } from '../connector/coding-tool-names';
import { codingSessionBoundCodec } from '../record/coding-session-bound-codec';
import { sessionStateSchema } from '../record/session-state-schema';
import { codingOptionsSchema } from '../start/coding-options-schema';
import type { CodingAdapter, CodingContext, CodingTables } from '../types';
import { runRelease } from './run-release';
import { writeLostSessionReport } from './write-lost-session-report';

const endedStates = ['stopped', 'closed', 'failed'] as const;

// Does what `ended` left undone, for a crash or a stop call that failed: for each coding task that
// is stopped, closed or failed and still binds its session, it lets go of the session. A spawn whose
// outcome no step read, because its task stopped first, binds its session first from that outcome.
export async function runCodingSweep(
  context: CodingContext,
  adapter: CodingAdapter,
): Promise<void> {
  await runLateSpawnBinds(context, adapter);

  const db = context.tasks.log.writer.db.$extendTables<CodingTables & TasksTables>();

  const rows = await db
    .selectFrom('coding_sessions')
    .innerJoin('tasks', 'tasks.task_id', 'coding_sessions.task_id')
    .select(['coding_sessions.task_id', 'tasks.state'])
    .where('coding_sessions.adapter', '=', adapter.id)
    .where('coding_sessions.unbound_at', 'is', null)
    .where('tasks.state', 'in', [...endedStates])
    .execute();

  for (const row of rows) {
    const cause = toEndCause(row.state);

    await runRelease(context, adapter, {
      taskID: row.task_id,
      cause,
      commit: (input) => writeSweepCommit(context, row.task_id, cause, input),
    });
  }
}

const spawnResultSchema = z.object({
  result: z.object({ sessionID: z.string(), state: sessionStateSchema, fromCursor: z.string() }),
});

async function runLateSpawnBinds(context: CodingContext, adapter: CodingAdapter): Promise<void> {
  const log = context.tasks.log;

  const spawns = await log.writer.db
    .$extendTables<ActionsTables & CodingTables & TasksTables>()
    .selectFrom('actions')
    .innerJoin('tasks', 'tasks.task_id', 'actions.task_id')
    .leftJoin('coding_sessions', 'coding_sessions.task_id', 'actions.task_id')
    .select(['actions.action_id', 'actions.task_id', 'actions.outcome_sequence'])
    .where('actions.tool', '=', codingToolNames.spawn)
    .where('actions.status', '=', 'done')
    .where('actions.outcome_sequence', 'is not', null)
    .where('tasks.state', 'in', [...endedStates])
    .where('coding_sessions.task_id', 'is', null)
    .whereRef('tasks.read_cursor', '<', 'actions.outcome_sequence')
    .execute();

  for (const spawn of spawns) {
    invariant(spawn.outcome_sequence !== null, 'a done action has its outcome');

    const [outcome, created] = await Promise.all([
      readRecords(log, { afterSequence: 0, sequences: [spawn.outcome_sequence] }),
      readCreatedOptions(context, spawn.task_id),
    ]);

    const record = outcome[0]?.record;
    const fields = record?.erasable.status === 'readable' ? record.erasable.fields : {};
    const spawned = spawnResultSchema.safeParse(fields);

    if (!spawned.success) {
      await writeLostSessionReport(context, adapter, {
        taskID: spawn.task_id,
        actionID: spawn.action_id,
      });
    }

    if (spawned.success && created !== null) {
      await withWriteTransaction(log.writer, (tx) =>
        writeRecordsInTransaction(tx, log, [
          {
            kind: codingSessionBoundCodec.kind,
            definitions: context.tasks.definitions(),
            thread: spawn.task_id,
            payload: codingSessionBoundCodec.encode({
              taskID: spawn.task_id,
              adapter: adapter.id,
              sessionID: spawned.data.result.sessionID,
              origin: 'started',
              actionID: spawn.action_id,
              fromCursor: spawned.data.result.fromCursor,
              wake: created.wake,
              state: spawned.data.result.state,
              hop: 0,
            }),
          },
        ]),
      );
    }
  }
}

async function readCreatedOptions(context: CodingContext, taskID: string) {
  const log = context.tasks.log;

  const row = await log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('created_sequence')
    .where('task_id', '=', taskID)
    .executeTakeFirstOrThrow();

  const [created] = await readRecords(log, { afterSequence: 0, sequences: [row.created_sequence] });

  const options = codingOptionsSchema.safeParse(created?.record.payload['runnerOptions']);

  return options.success ? options.data : null;
}

function toEndCause(state: string): RunnerEndCause {
  if (state === 'stopped') {
    return 'stopped';
  }

  return state === 'closed' ? 'closed' : 'failed';
}

// The sweep commits as `ended` does, under the same step key, so a sweep after an `ended` that
// queued its stop queues no second one.
function writeSweepCommit(
  context: CodingContext,
  taskID: string,
  cause: RunnerEndCause,
  input: RunnerEndCommit,
): Promise<void> {
  const tasks = context.tasks;

  return withWriteTransaction(tasks.log.writer, async (tx) => {
    await writeRecordsInTransaction(tx, tasks.log, input.records);

    if (input.actions.length > 0) {
      invariant(tasks.queueRunnerActions, 'the coding runner needs the actions queue');

      await tasks.queueRunnerActions(tx, {
        taskID,
        stepKey: `ended:${cause}:${taskID}`,
        actions: input.actions,
      });
    }
  });
}
