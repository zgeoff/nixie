import type { RecordKind } from '@heynixie/log';
import { readPauseSince, readSpendStopSince } from '@heynixie/log';
import type { Kysely } from 'kysely';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import type { GateCaller, TaskGate, TaskHoldReason, TasksTables } from '../types';
import { holdReasons } from './build-hold-checks';
import { pickGateRule } from './pick-gate-rule';
import { readTaskHolds } from './read-task-holds';

// The one answer to "may this task go on": open, or held with the first reason that holds. A caller
// that names itself skips the reasons its rule always passes, so a reason it passes never hides one
// it heeds, such as an ended task under nixie's pause.
export async function readTaskGate(
  db: Kysely<unknown>,
  taskID: string,
  caller?: GateCaller,
): Promise<TaskGate> {
  const holds = await readTaskHolds(db, taskID);

  const reason = holdReasons.find(
    (candidate) =>
      holds[candidate] && (caller === undefined || pickGateRule(caller, candidate) !== 'pass'),
  );

  if (reason === undefined) {
    return { open: true };
  }

  const since = await readSince(db, taskID, reason);

  invariant(since !== null, `a task held for ${reason} has the record that holds it`);

  return { open: false, reason, since };
}

function readSince(
  db: Kysely<unknown>,
  taskID: string,
  reason: TaskHoldReason,
): Promise<number | null> {
  return match(reason)
    .with('spend', () => readSpendStopSince(db))
    .with('nixie', () => readPauseTime(db))
    .with('limit', () => readNewestRecordTime(db, taskID, ['task.limit_reached']))
    .with('task', () => readNewestRecordTime(db, taskID, ['task.paused']))
    .with('ended', () => readEndedSince(db, taskID))
    .exhaustive();
}

async function readPauseTime(db: Kysely<unknown>): Promise<number | null> {
  const pause = await readPauseSince(db);

  return pause === null ? null : pause.since;
}

async function readNewestRecordTime(
  db: Kysely<unknown>,
  taskID: string,
  kinds: readonly RecordKind[],
): Promise<number | null> {
  const row = await db
    .$extendTables<TasksTables>()
    .selectFrom('records')
    .select('recorded_at')
    .where('thread', '=', taskID)
    .where('kind', 'in', kinds)
    .orderBy('sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  return row === undefined ? null : row.recorded_at;
}

// The record that sets each ended state. An inbox record also moves the task row, so the row's own
// sequence is no answer.
const endingKinds: Readonly<Record<string, RecordKind>> = {
  done: 'task.step_committed',
  failed: 'task.step_errored',
  stopped: 'task.stopped',
  closed: 'task.closed',
};

async function readEndedSince(db: Kysely<unknown>, taskID: string): Promise<number | null> {
  const task = await db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('state')
    .where('task_id', '=', taskID)
    .executeTakeFirst();

  const kind = task === undefined ? undefined : endingKinds[task.state];

  return kind === undefined ? null : readNewestRecordTime(db, taskID, [kind]);
}
