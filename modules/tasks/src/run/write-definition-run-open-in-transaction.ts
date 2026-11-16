import { createShortID } from '@heynixie/db';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { TasksContext } from '../types';
import { conversationTaskID } from '../utils/conversation-task-id';
import { pickReportMode } from './pick-report-mode';
import { pickRunDefinition } from './pick-run-definition';
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

  if (pick.isEndingOpen) {
    await writeRunEndInTransaction(tx, context, {
      taskID: request.taskID,
      trigger: { kind: 'claim' },
      endedBy: `claim:${request.stepKey}`,
      stepKey: request.stepKey,
    });
  }

  const opened =
    pick.carries === null
      ? await readDefinitionOpened(tx, context, request, {
          definitionID: read.definitionID,
          origin: pick.origin,
          definitionHash: pick.definitionHash,
          triggerKey: pick.triggerKey,
        })
      : await readCarriedOpened(tx, context, {
          runs: read.runs,
          carries: pick.carries,
          stepKey: request.stepKey,
          origin: pick.origin,
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

interface DefinitionOpening {
  readonly definitionID: string;
  readonly origin: TaskRunOpened['origin'];
  readonly definitionHash: string;
  readonly triggerKey: string | null;
}

async function readDefinitionOpened(
  tx: Transaction<unknown>,
  context: OpenContext,
  request: DefinitionRunOpenRequest,
  opening: DefinitionOpening,
): Promise<TaskRunOpened> {
  const policy = await context.readDefinitionRunPolicy(tx, request.taskID, opening.definitionHash);

  if (policy === null) {
    throw new Error(
      `no version of hash ${opening.definitionHash} is stored, so the task ${request.taskID} opens no task run`,
    );
  }

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
