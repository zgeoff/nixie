import { createShortID } from '@heynixie/db';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { DefinitionRunPolicy, TasksContext } from '../types';
import { conversationTaskID } from '../utils/conversation-task-id';
import { pickReportMode } from './pick-report-mode';
import { pickRunDefinition } from './pick-run-definition';
import type { RunDefinitionPick } from './pick-run-definition';
import { readCarriedOpened } from './read-carried-opened';
import type { DefinitionRunFacts } from './read-definition-run-facts';
import { taskRunOpenedCodec } from './task-run-opened-codec';
import type { TaskRunOpened } from './types';
import { writeRunEndInTransaction } from './write-run-end-in-transaction';

type OpenContext = Pick<
  TasksContext,
  'definitions' | 'log' | 'runSettings' | 'runners' | 'readDefinitionRunPolicy'
>;

export type DefinitionRunOpenOutcome = 'held' | 'ready' | 'none';

export interface DefinitionRunOpenRequest {
  readonly taskID: string;
  readonly stepKey: string;
}

// The claim of a definition's task. An open task run takes the step, and the claim ends an idle one
// only to open the task run of a fire that waits beside it.
export async function writeDefinitionRunOpenInTransaction(
  tx: Transaction<unknown>,
  context: OpenContext,
  request: DefinitionRunOpenRequest,
  read: DefinitionRunFacts,
): Promise<DefinitionRunOpenOutcome> {
  const pick = pickRunDefinition(read.facts);

  if (pick.kind === 'hold') {
    return 'held';
  }

  if (pick.kind === 'none') {
    return 'none';
  }

  if (pick.kind === 'join') {
    return 'ready';
  }

  const opened = await readOpened(tx, context, request, { read, pick });

  // A fire whose version is not stored opens no task run and ends no idle one. The step that follows
  // fails on it, so it retries up to the step error limit and then fails the task.
  if (opened === null) {
    return 'ready';
  }

  if (pick.isEndingOpen) {
    await writeRunEndInTransaction(tx, context, {
      taskID: request.taskID,
      trigger: { kind: 'claim' },
      endedBy: `claim:${request.stepKey}`,
      stepKey: request.stepKey,
    });
  }

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

interface OpenFacts {
  readonly read: DefinitionRunFacts;
  readonly pick: Extract<RunDefinitionPick, { kind: 'open' }>;
}

async function readOpened(
  tx: Transaction<unknown>,
  context: OpenContext,
  request: DefinitionRunOpenRequest,
  facts: OpenFacts,
): Promise<TaskRunOpened | null> {
  const carries = facts.pick.carries;

  if (carries !== null) {
    return readCarriedOpened(tx, context, {
      runs: facts.read.runs,
      carries,
      stepKey: request.stepKey,
      origin: facts.pick.origin,
    });
  }

  const hash = facts.pick.definitionHash;

  const policy = await context.readDefinitionRunPolicy(tx, request.taskID, hash);

  return policy === null
    ? null
    : buildDefinitionOpened(context, request, policy, {
        definitionID: facts.read.definitionID,
        origin: facts.pick.origin,
        definitionHash: hash,
        triggerKey: facts.pick.triggerKey,
      });
}

interface DefinitionOpening {
  readonly definitionID: string;
  readonly origin: TaskRunOpened['origin'];
  readonly definitionHash: string;
  readonly triggerKey: string | null;
}

function buildDefinitionOpened(
  context: OpenContext,
  request: DefinitionRunOpenRequest,
  policy: DefinitionRunPolicy,
  opening: DefinitionOpening,
): TaskRunOpened {
  const mode = pickReportMode(policy.report ?? undefined, 'definition', context.runSettings);

  return {
    taskID: request.taskID,
    runID: crypto.randomUUID(),
    openedByStep: request.stepKey,
    origin: opening.origin,
    definitionID: opening.definitionID,
    definitionHash: opening.definitionHash,
    triggerKey: opening.triggerKey,
    carriesRunID: null,
    briefID: createShortID(),
    report: { mode, target: mode === 'none' ? null : conversationTaskID },
    reportShape: policy.reportShape,
    limits: policy.limits,
  };
}
