import type { EnvelopeRecord } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { readLimitRecords } from '../limit/read-limit-records';
import { pickWakeSource } from '../step/pick-wake-source';
import type { TasksContext } from '../types';
import { pickReportMode } from './pick-report-mode';
import { pickRunOpening } from './pick-run-opening';
import { pickRunOrigin } from './pick-run-origin';
import { readCarriedOpened } from './read-carried-opened';
import type { OpenedOrigin } from './read-carried-opened';
import { readCarryingControl } from './read-carrying-control';
import { readDefinitionRunFacts } from './read-definition-run-facts';
import { readRunRows } from './read-run-rows';
import { readRunSetup } from './read-run-setup';
import type { RunSetup } from './read-run-setup';
import { taskRunOpenedCodec } from './task-run-opened-codec';
import type { TaskRunOpened } from './types';
import type { DefinitionRunOpenOutcome } from './write-definition-run-open-in-transaction';
import { writeDefinitionRunOpenInTransaction } from './write-definition-run-open-in-transaction';

export interface RunOpenRequest {
  readonly taskID: string;
  readonly stepKey: string;
  readonly unread: readonly Pick<EnvelopeRecord, 'kind' | 'payload' | 'thread' | 'sequence'>[];
}

export type RunOpenOutcome = DefinitionRunOpenOutcome;

// The caller holds the claim's write transaction. A task with an open task run runs its step in it,
// so a rerun of a first step opens no second one.
export async function writeRunOpenInTransaction(
  tx: Transaction<unknown>,
  context: Pick<
    TasksContext,
    'definitions' | 'log' | 'runSettings' | 'runners' | 'readDefinitionRunPolicy'
  >,
  request: RunOpenRequest,
): Promise<RunOpenOutcome> {
  const definition = await readDefinitionRunFacts(tx, request.taskID);

  if (definition !== null) {
    return writeDefinitionRunOpenInTransaction(tx, context, request, definition);
  }

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
          stepKey: request.stepKey,
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

function pickWaking(request: RunOpenRequest) {
  const source = pickWakeSource(request.unread);

  return source === null ? null : pickRunOrigin(source);
}

function buildFreshOpened(
  context: Pick<TasksContext, 'runSettings'>,
  setup: RunSetup,
  request: RunOpenRequest,
  origin: OpenedOrigin,
): TaskRunOpened {
  const mode = pickReportMode(setup.report, 'start', context.runSettings);

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
    reportShape: setup.reportShape,
    limits: { ...setup.limits, calls: {} },
  };
}
