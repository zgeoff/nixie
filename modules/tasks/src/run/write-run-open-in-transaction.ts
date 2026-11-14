import type { EnvelopeRecord } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { readLimitRecords } from '../limit/read-limit-records';
import { pickWakeSource } from '../step/pick-wake-source';
import type { TasksContext, TasksTables } from '../types';
import { pickCarriedLimits } from './pick-carried-limits';
import { pickReportMode } from './pick-report-mode';
import { pickRunOpening } from './pick-run-opening';
import { pickRunOrigin } from './pick-run-origin';
import { readPieceCounts } from './read-piece-counts';
import { readRunRows } from './read-run-rows';
import { readRunSetup } from './read-run-setup';
import type { RunSetup } from './read-run-setup';
import { toRunEndCause } from './run-end-cause';
import { taskRunOpenedCodec } from './task-run-opened-codec';
import type { TaskRun, TaskRunOpened } from './types';

export interface RunOpenRequest {
  readonly taskID: string;
  readonly stepKey: string;
  readonly unread: readonly Pick<EnvelopeRecord, 'kind' | 'payload' | 'thread' | 'sequence'>[];
}

export type RunOpenOutcome = 'held' | 'ready';

// The caller holds the claim's write transaction. A task with an open task run runs its step in it,
// so a rerun of a first step opens no second one.
export async function writeRunOpenInTransaction(
  tx: Transaction<unknown>,
  context: Pick<TasksContext, 'definitions' | 'log' | 'runSettings'>,
  request: RunOpenRequest,
): Promise<RunOpenOutcome> {
  const setup = await readRunSetup(tx, request.taskID);
  const runs = await readRunRows(tx, request.taskID);

  const newest = runs.at(-1) ?? null;

  const limitRecords = await readLimitRecords(tx, request.taskID);

  const opening = pickRunOpening({
    isStarted: setup !== null,
    hasOpenRun: runs.some((run) => run.ended === null),
    isLimitHeld: limitRecords.heldAt !== null,
    control: await readCarryingControl(tx, request.taskID, newest),
    newest,
    waking: pickWaking(request),
  });

  if (opening.kind === 'hold') {
    return 'held';
  }

  if (opening.kind !== 'open' || setup === null) {
    return 'ready';
  }

  const opened =
    opening.carries === null
      ? buildFreshOpened(context, setup, request, opening.origin)
      : await readCarriedOpened(tx, context, {
          runs,
          carries: opening.carries,
          request,
          origin: opening.origin,
        });

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: taskRunOpenedCodec.kind,
      definitions: context.definitions(),
      thread: request.taskID,
      payload: taskRunOpenedCodec.encode(opened),
    },
  ]);

  return 'ready';
}

const carriedCauses = new Set(['limit', 'stopped', 'failed']);

// The newest raise or restart that is newer than the end of the newest task run, when that task run
// ended with a cause that a raise or a restart continues.
async function readCarryingControl(
  tx: Transaction<unknown>,
  taskID: string,
  newest: TaskRun | null,
): Promise<{ readonly kind: 'raise' | 'restart'; readonly sequence: number } | null> {
  const ended = newest?.ended ?? null;

  if (ended === null || !carriedCauses.has(toRunEndCause(ended.record.cause))) {
    return null;
  }

  const control = await tx
    .$extendTables<TasksTables>()
    .selectFrom('records')
    .select(['sequence', 'kind'])
    .where('thread', '=', taskID)
    .where('kind', 'in', ['task.limits_raised', 'task.restarted'])
    .where('sequence', '>', ended.sequence)
    .orderBy('sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  return control === undefined
    ? null
    : {
        kind: control.kind === 'task.limits_raised' ? 'raise' : 'restart',
        sequence: control.sequence,
      };
}

function pickWaking(request: RunOpenRequest) {
  const source = pickWakeSource(request.unread);

  return source === null ? null : pickRunOrigin(source);
}

interface OpenedOrigin {
  readonly kind: string;
  readonly sequence: number | null;
}

function buildFreshOpened(
  context: Pick<TasksContext, 'runSettings'>,
  setup: RunSetup,
  request: RunOpenRequest,
  origin: OpenedOrigin,
): TaskRunOpened {
  const mode = pickReportMode(setup.options.report, 'start', context.runSettings);

  return {
    taskID: request.taskID,
    runID: crypto.randomUUID(),
    openedByStep: request.stepKey,
    origin,
    definitionID: null,
    definitionHash: null,
    triggerKey: null,
    carriesRunID: null,
    briefID: null,
    report: { mode, target: mode === 'none' ? null : setup.startedBy },
    reportShape: setup.options.reportShape ?? null,
    limits: { ...setup.options.limits, calls: {} },
  };
}

interface CarriedOpening {
  readonly runs: readonly TaskRun[];
  readonly carries: TaskRun;
  readonly request: RunOpenRequest;
  readonly origin: OpenedOrigin;
}

async function readCarriedOpened(
  tx: Transaction<unknown>,
  context: Pick<TasksContext, 'log' | 'runSettings'>,
  opening: CarriedOpening,
): Promise<TaskRunOpened> {
  const carries = opening.carries;

  const counts = await readPieceCounts(tx, context, opening.runs, carries);

  return {
    ...carries.opened,
    runID: crypto.randomUUID(),
    openedByStep: opening.request.stepKey,
    origin: opening.origin,
    carriesRunID: carries.runID,
    limits: pickCarriedLimits({
      kind: opening.origin.kind === 'restart' ? 'restart' : 'raise',
      first: counts.first,
      raised: counts.raised,
      used: counts.used,
    }),
  };
}
