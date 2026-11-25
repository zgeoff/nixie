import { createShortID } from '@heynixie/db';
import type { JSONObject } from '@heynixie/log';
import { readRecords, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { writeBriefMessageInTransaction } from '../../brief/write-brief-message-in-transaction';
import { taskRunOptionsSchema } from '../../limit/task-run-options-schema';
import type { RunnerAction, StartTransaction } from '../../runner/types';
import { readLeasedStepHop } from '../../step/read-leased-step-hop';
import type { TaskLimits, TaskReport, TasksContext, TasksTables } from '../../types';
import type { StepRunRef } from '../../utils/parse-step-run-id';
import { parseStepRunID } from '../../utils/parse-step-run-id';
import { taskCreatedCodec } from '../codec/task-created-codec';

// What the start stores beside the runner's key: the built options, or the envelope and the options
// that the runner keeps for itself.
type StoredStart =
  | { readonly kind: 'built'; readonly options: JSONObject }
  | {
      readonly kind: 'enveloped';
      readonly envelope: { readonly report: TaskReport; readonly limits: TaskLimits };
      readonly runnerOptions: JSONObject;
    };

export interface TaskStartRequest {
  // queued on the new task's thread in the start's transaction; none when absent
  readonly actions?: readonly RunnerAction[];

  // the runner's own checks and writes in the start's transaction
  readonly transaction?: StartTransaction | undefined;

  readonly from: string;
  readonly name: string;
  readonly brief: string;
  readonly runner: string;
  readonly stored: StoredStart;
  readonly hopLimit: number;
  readonly stepRunID: string | null;

  // a disposable task closes when its work ends; a kept one waits for a close
  readonly disposable: boolean;
}

export type TaskStartRefusal =
  | { readonly reason: 'empty_name' }
  | { readonly reason: 'empty_brief' }
  | { readonly reason: 'stale_step' }
  | { readonly reason: 'runner_refused'; readonly sentence: string };

export type TaskStartOutcome =
  | { readonly status: 'started'; readonly taskID: string }
  | { readonly status: 'refused'; readonly refusal: TaskStartRefusal };

export async function writeTaskStart(
  context: Pick<TasksContext, 'clock' | 'definitions' | 'log' | 'queueRunnerActions'>,
  request: TaskStartRequest,
): Promise<TaskStartOutcome> {
  const name = request.name.trim();

  if (name === '') {
    return { status: 'refused', refusal: { reason: 'empty_name' } };
  }

  if (request.brief.trim() === '') {
    return { status: 'refused', refusal: { reason: 'empty_brief' } };
  }

  const step = request.stepRunID === null ? null : parseStepRunID(request.stepRunID);

  if (step === null) {
    return { status: 'refused', refusal: { reason: 'stale_step' } };
  }

  let outcome = await writeStartAttempt(context, { ...request, name }, step);

  while (outcome === null) {
    outcome = await writeStartAttempt(context, { ...request, name }, step);
  }

  return outcome;
}

// The name is erasable, so the log keeps no copy of it outside its key: the match reads the names
// before the write transaction. A start in the same step that commits in between changes the step's
// task count, so the attempt returns null and the caller reads the names again.
async function writeStartAttempt(
  context: Pick<TasksContext, 'clock' | 'definitions' | 'log' | 'queueRunnerActions'>,
  request: TaskStartRequest,
  step: StepRunRef,
): Promise<TaskStartOutcome | null> {
  const earlier = await readStartedTask(context, step.stepKey, {
    name: request.name,
    runner: request.runner,
  });

  return withWriteTransaction(context.log.writer, async (tx) => {
    const hop = await readLeasedStepHop(tx, request.from, step, context.clock.now());

    if (hop === null) {
      return { status: 'refused', refusal: { reason: 'stale_step' } };
    }

    const current = await tx
      .$extendTables<TasksTables>()
      .selectFrom('tasks')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('start_step', '=', step.stepKey)
      .executeTakeFirstOrThrow();

    if (current.count !== earlier.stepTaskCount) {
      return null;
    }

    const taskID = earlier.taskID ?? createShortID();

    if (earlier.taskID === null) {
      const checked = await request.transaction?.check(tx);

      const sentence = checked ?? null;

      if (sentence !== null) {
        return { status: 'refused', refusal: { reason: 'runner_refused', sentence } };
      }

      const briefMessageID = createShortID();

      await writeRecordsInTransaction(tx, context.log, [
        {
          kind: 'task.created',
          definitions: context.definitions(),
          thread: taskID,
          payload: buildCreatedPayload(request, {
            taskID,
            startStep: step.stepKey,
            briefMessageID,
          }),
          erasable: { name: request.name },
        },
      ]);

      await writeBriefMessageInTransaction(tx, context, {
        messageID: briefMessageID,
        from: request.from,
        to: taskID,
        hopLimit: request.hopLimit,
        body: request.brief,
      });

      await request.transaction?.write(tx, taskID);

      if (request.actions !== undefined && request.actions.length > 0) {
        invariant(
          context.queueRunnerActions,
          'a start that queues actions needs the actions queue',
        );

        await context.queueRunnerActions(tx, {
          taskID,
          stepKey: step.stepKey,
          actions: request.actions,
        });
      }
    }

    return { status: 'started', taskID };
  });
}

interface StartedTask {
  readonly taskID: string | null;
  readonly stepTaskCount: number;
}

interface StartIdentity {
  readonly name: string;
  readonly runner: string;
}

// A rerun of a step that crashed after its start committed calls the start again with the same
// name and runner, and gets the task the first run started. A task of another runner that holds the
// same name is a different start.
async function readStartedTask(
  context: Pick<TasksContext, 'log'>,
  stepKey: string,
  identity: StartIdentity,
): Promise<StartedTask> {
  const rows = await context.log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['task_id', 'created_sequence'])
    .where('start_step', '=', stepKey)
    .orderBy('created_sequence')
    .execute();

  if (rows.length === 0) {
    return { taskID: null, stepTaskCount: 0 };
  }

  const created = await readRecords(context.log, {
    afterSequence: 0,
    sequences: rows.map((row) => row.created_sequence),
  });

  const match = created.find(
    (entry) =>
      entry.record.erasable.status === 'readable' &&
      entry.record.erasable.fields['name'] === identity.name &&
      entry.record.payload['runner'] === identity.runner,
  );

  return {
    taskID: rows.find((row) => row.created_sequence === match?.record.sequence)?.task_id ?? null,
    stepTaskCount: rows.length,
  };
}

interface CreatedIDs {
  readonly taskID: string;
  readonly startStep: string;
  readonly briefMessageID: string;
}

function buildCreatedPayload(request: TaskStartRequest, ids: CreatedIDs): JSONObject {
  const created = taskCreatedCodec.encode({
    taskID: ids.taskID,
    isConversation: false,
    state: 'ready',
    startedBy: request.from,
    startStep: ids.startStep,
    runner: request.runner,
    ...(request.stored.kind === 'built'
      ? { options: taskRunOptionsSchema.parse(request.stored.options) }
      : { envelope: request.stored.envelope }),
    briefMessageID: ids.briefMessageID,
    disposable: request.disposable,
  });

  return request.stored.kind === 'built'
    ? created
    : { ...created, runnerOptions: request.stored.runnerOptions };
}
