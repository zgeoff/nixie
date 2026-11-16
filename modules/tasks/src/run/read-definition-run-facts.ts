import { parseJSONObject } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { readLimitRecords } from '../limit/read-limit-records';
import { pickWakeSource } from '../step/pick-wake-source';
import { parseTriggerFired } from '../task/codec/parse-trigger-fired';
import type { TaskState, TasksTables } from '../types';
import { isWakingRecord } from '../utils/is-waking-record';
import type { RunDefinitionFacts, UnreadFire } from './pick-run-definition';
import { pickRunOrigin } from './pick-run-origin';
import { readCarryingControl } from './read-carrying-control';
import { readRunRows } from './read-run-rows';
import type { RunPhase, TaskRun } from './types';

export interface DefinitionRunFacts {
  readonly definitionID: string;
  readonly facts: RunDefinitionFacts;
  readonly runs: readonly TaskRun[];
  readonly state: TaskState;

  // the sequences of the unread trigger.fired records that this release's codec does not know
  readonly unknownFires: readonly number[];
}

// The one read that the claim, the fire answer and every reader of "pending" share. A caller inside
// a write transaction passes it as the handle, so the read sees what the transaction wrote.
// Returns null for a task that is no definition's task.
export async function readDefinitionRunFacts(
  db: Kysely<unknown>,
  taskID: string,
): Promise<DefinitionRunFacts | null> {
  const tasks = db.$extendTables<TasksTables>();

  const task = await tasks
    .selectFrom('tasks')
    .select(['state', 'read_cursor', 'definition_id', 'definition_hash'])
    .where('task_id', '=', taskID)
    .executeTakeFirst();

  if (task === undefined || task.definition_id === null) {
    return null;
  }

  const runs = await readRunRows(db, taskID);

  const newest = runs.at(-1) ?? null;
  const open = runs.find((run) => run.ended === null) ?? null;

  const limitRecords = await readLimitRecords(db, taskID);

  const rows = await tasks
    .selectFrom('records')
    .select(['sequence', 'kind', 'thread', 'payload'])
    .where('thread', '=', taskID)
    .where('sequence', '>', task.read_cursor)
    .orderBy('sequence')
    .execute();

  const unread = rows.map((record) => ({
    sequence: record.sequence,
    kind: record.kind,
    thread: record.thread,
    payload: parseJSONObject(record.payload),
  }));

  const fires: UnreadFire[] = [];
  const unknownFires: number[] = [];

  for (const record of unread.filter((entry) => entry.kind === 'trigger.fired')) {
    const fire = parseTriggerFired(record.payload);

    if (fire === null) {
      unknownFires.push(record.sequence);
    } else {
      fires.push({
        sequence: record.sequence,
        dedupeKey: fire.dedupeKey,
        definitionHash: fire.definitionHash,
      });
    }
  }

  const waking = pickWakeSource(
    unread.filter((record) => record.kind !== 'trigger.fired' && isWakingRecord(record)),
  );

  return {
    definitionID: task.definition_id,
    state: task.state,
    unknownFires,
    runs,
    facts: {
      open: open === null ? null : { phase: await readPhase(db, taskID, open, task.state) },
      isLimitHeld: limitRecords.heldAt !== null,
      control: await readCarryingControl(db, taskID, newest),
      newest,
      fires,
      heldKeys: new Set(runs.flatMap((run) => run.opened.triggerKey ?? [])),
      waking: waking === null ? null : pickRunOrigin(waking),
      hashInForce: task.definition_hash,
    },
  };
}

// A task run that waits for a reply is waiting_reply, and one whose last step left the task waiting
// is idle, even when an unread fire has since moved the task to ready.
async function readPhase(
  db: Kysely<unknown>,
  taskID: string,
  open: TaskRun,
  state: TaskState,
): Promise<RunPhase> {
  const tasks = db.$extendTables<TasksTables>();

  const wait = await tasks
    .selectFrom('task_messages')
    .select('message_id')
    .where('from_task', '=', taskID)
    .where('wait_state', '=', 'open')
    .limit(1)
    .executeTakeFirst();

  if (wait !== undefined) {
    return 'waiting_reply';
  }

  if (state === 'waiting') {
    return 'idle';
  }

  if (state !== 'ready') {
    return 'active';
  }

  const commit = await tasks
    .selectFrom('records')
    .select('payload')
    .where('thread', '=', taskID)
    .where('kind', '=', 'task.step_committed')
    .where('sequence', '>', open.openedSequence)
    .orderBy('sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  const next = commit === undefined ? null : parseJSONObject(commit.payload)['nextState'];

  return next === 'waiting' ? 'idle' : 'active';
}
