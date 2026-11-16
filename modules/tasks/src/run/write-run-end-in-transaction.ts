import { createShortID } from '@heynixie/db';
import { readRecords, writeRecordsInTransaction } from '@heynixie/log';
import type { JSONObject } from '@heynixie/log';
import { isFinishedState } from '@heynixie/task-control';
import { countCapCalls } from '@heynixie/tools';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import { writeInboxRecordsInTransaction } from '../inbox/write-inbox-records-in-transaction';
import { taskLimitNoticeCodec } from '../limit/task-limit-notice-codec';
import { codeMadeSummaries } from '../report/code-made-summaries';
import type { ReportBody } from '../report/render-report-body';
import { renderReportBody } from '../report/render-report-body';
import { writeTaskLimitHoldInTransaction } from '../task/limit/write-task-limit-hold-in-transaction';
import { buildPausedRecord } from '../task/record/build-paused-record';
import type { TaskState, TasksContext, TasksTables } from '../types';
import { taskMessageCodec } from '../utils/task-message-codec';
import { pickRunDelivery } from './pick-run-delivery';
import { pickRunEnding } from './pick-run-ending';
import type { RunEnding, RunEndingTrigger } from './pick-run-ending';
import { readOpenRun } from './read-open-run';
import { readPieceCounts } from './read-piece-counts';
import { readRunRows } from './read-run-rows';
import { taskRunEndedCodec } from './task-run-ended-codec';
import { taskRunReportRequestedCodec } from './task-run-report-requested-codec';
import { toTransactionContext } from './to-transaction-context';
import type { TaskRun } from './types';

export interface RunEndRequest {
  readonly taskID: string;
  readonly trigger: RunEndingTrigger;

  // step:<stepKey>, control:stop, control:close or claim:<stepKey>
  readonly endedBy: string;

  // the step that holds the lease, for a limit end's hold
  readonly stepKey: string | null;

  // the errors that failed the task
  readonly errors?: number;
}

type EndContext = Pick<TasksContext, 'definitions' | 'log' | 'runSettings' | 'runners'>;

// The one function that ends a task run, and the tasks module does not export it. The caller holds
// the write transaction, so the end commits with the records that caused it. A task with no open task
// run gets nothing written and returns null, as does an end that leaves the task run open.
export async function writeRunEndInTransaction(
  tx: Transaction<unknown>,
  context: EndContext,
  request: RunEndRequest,
): Promise<RunEnding | null> {
  const run = await readOpenRun(tx, request.taskID);

  if (run === null) {
    return null;
  }

  const ending = pickRunEnding(request.trigger);

  if (ending === null) {
    return null;
  }

  const inTransaction = toTransactionContext(context, tx);
  const db = tx.$extendTables<TasksTables>();

  const task = await db
    .selectFrom('tasks')
    .select(['step_hop', 'started_by'])
    .where('task_id', '=', request.taskID)
    .executeTakeFirstOrThrow();

  const used = await readRunUsed(tx, inTransaction, run);

  const target = run.opened.report.target;
  const targetState = target === null ? null : await readTaskState(tx, target);

  const delivery = pickRunDelivery({
    cause: ending.cause,
    mode: run.opened.report.mode,
    targetState,
    hop: task.step_hop,
    hopLimit: context.runSettings.hopLimit,
  });

  const detail = buildDetail(run, ending, request, used);
  const reportID = run.reportID ?? createShortID();

  const reportBody = await readReportBody(inTransaction, run, ending, detail);

  const body = renderReportBody(reportBody);
  const definitions = context.definitions();

  if (ending.cause === 'limit') {
    await writeLimitHold(tx, context, run, {
      stepKey: request.stepKey,
      target: target ?? task.started_by,
      isReportWake: delivery.delivery === 'wake',
    });
  }

  if (delivery.isMessageWritten && target !== null) {
    await writeInboxRecordsInTransaction(tx, context, [
      {
        kind: 'task_message',
        definitions,
        thread: target,
        payload: taskMessageCodec.encode({
          messageID: reportID,
          from: request.taskID,
          to: target,
          kind: 'report',
          replyTo: null,
          onBehalfOf: [],
          hop: task.step_hop + 1,
          hopLimit: context.runSettings.hopLimit,
          wake: delivery.delivery === 'wake',
          woke: delivery.delivery === 'wake',
          opensWait: false,
          source: `task:${request.taskID}`,
        }),
        erasable: { body },
      },
    ]);
  }

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: taskRunEndedCodec.kind,
      definitions,
      thread: request.taskID,
      payload: taskRunEndedCodec.encode({
        taskID: request.taskID,
        runID: run.runID,
        cause: ending.cause,
        detail,
        endedBy: request.endedBy,
        definitionID: run.opened.definitionID,
        triggerKey: run.opened.triggerKey,
        carriesRunID: run.opened.carriesRunID,
        used,
        reportID,
        reportTo: target,
        delivery: delivery.delivery,
      }),
      erasable: { body },
    },
  ]);

  return ending;
}

interface RunUsed {
  readonly turns: number;
  readonly dollars: number;
  readonly calls: Readonly<Record<string, number>>;
}

async function readRunUsed(
  tx: Transaction<unknown>,
  context: EndContext,
  run: TaskRun,
): Promise<RunUsed> {
  const used = { turns: 0, dollars: 0 };

  for (const meter of context.runSettings.meters) {
    used[meter.name] = await meter.read(context, run);
  }

  const calls: Record<string, number> = {};

  for (const tool of Object.keys(run.opened.limits.calls)) {
    calls[tool] = await countCapCalls(tx, {
      thread: run.taskID,
      taskRunID: run.runID,
      tool,
      beforeSequence: Number.MAX_SAFE_INTEGER,
    });
  }

  return { ...used, calls };
}

async function readTaskState(tx: Transaction<unknown>, taskID: string): Promise<TaskState | null> {
  const row = await tx
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('state')
    .where('task_id', '=', taskID)
    .executeTakeFirst();

  return row?.state ?? null;
}

function buildDetail(
  run: TaskRun,
  ending: RunEnding,
  request: RunEndRequest,
  used: RunUsed,
): Record<string, string | number> {
  if (ending.limitMeter !== null) {
    return {
      meter: ending.limitMeter,
      used: used[ending.limitMeter],
      limit: run.opened.limits[ending.limitMeter],
    };
  }

  if (ending.cause === 'failed') {
    return { errors: request.errors ?? 0 };
  }

  return {};
}

// A report that the model or the runner asked for, or the code-made summary of the end. A forget
// that destroyed the request before the end leaves the code-made summary too.
async function readReportBody(
  context: EndContext,
  run: TaskRun,
  ending: RunEnding,
  detail: Readonly<Record<string, string | number>>,
): Promise<ReportBody> {
  const shape = run.opened.reportShape;
  const asked = run.reportID === null ? null : await readReportRequest(context, run);

  if (asked !== null) {
    return {
      summary: asked.summary,
      ...(shape === null || asked.fields === undefined ? {} : { fields: asked.fields }),
    };
  }

  return {
    summary: renderCodeMadeSummary(context, run, ending, detail),
    ...(shape === null ? {} : { missing: Object.keys(shape.properties) }),
  };
}

interface ReportRequest {
  readonly summary: string;
  readonly fields: JSONObject | undefined;
}

async function readReportRequest(context: EndContext, run: TaskRun): Promise<ReportRequest | null> {
  const requests = await readRecords(context.log, {
    afterSequence: run.openedSequence,
    thread: run.taskID,
    kinds: [taskRunReportRequestedCodec.kind],
    limit: 100,
  });

  const request = requests.find(
    (entry) => taskRunReportRequestedCodec.decode(entry.record.payload).runID === run.runID,
  );

  const erasable = request?.record.erasable;

  if (erasable?.status !== 'readable') {
    return null;
  }

  const summary = erasable.fields['summary'];
  const fields = erasable.fields['fields'];

  if (typeof summary !== 'string') {
    return null;
  }

  return { summary, fields: z.record(z.string(), z.json()).safeParse(fields).data };
}

function renderCodeMadeSummary(
  context: EndContext,
  run: TaskRun,
  ending: RunEnding,
  detail: Readonly<Record<string, string | number>>,
): string {
  const meter = context.runSettings.meters.find(
    (candidate) => candidate.name === ending.limitMeter,
  );

  const sentences: Readonly<Record<string, string>> = codeMadeSummaries;
  const sentence = sentences[ending.cause] ?? codeMadeSummaries.no_report;
  const limit = meter === undefined ? '' : meter.render(run.opened.limits[meter.name]);

  return sentence.replace('{limit}', limit).replace('{count}', String(detail['errors'] ?? 0));
}

interface LimitHold {
  readonly stepKey: string | null;

  // the report target that the task run pinned, else the starter of a started task, or null
  readonly target: string | null;

  // whether the report wakes its target, which then needs no notice
  readonly isReportWake: boolean;
}

// The step that meets the limit still holds its lease, so the pause is a request that the commit
// carries out, and the hold and the target's notice commit with the end of the task run.
async function writeLimitHold(
  tx: Transaction<unknown>,
  context: EndContext,
  run: TaskRun,
  hold: LimitHold,
): Promise<void> {
  const taskID = run.taskID;

  const runs = await readRunRows(tx, taskID);
  const counts = await readPieceCounts(tx, context, runs, run);

  const pinned = counts.first.opened.limits;
  const limits = counts.raised ?? { turns: pinned.turns, dollars: pinned.dollars };
  const used = { turns: counts.used.turns, dollars: counts.used.dollars };

  const task = await tx
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('state')
    .where('task_id', '=', taskID)
    .executeTakeFirstOrThrow();

  if (task.state === 'ready' || task.state === 'waiting') {
    await writeRecordsInTransaction(tx, context.log, [
      buildPausedRecord(taskID, task.state, context.definitions()),
    ]);
  }

  await writeTaskLimitHoldInTransaction(tx, context, taskID, {
    kind: 'reach',
    stepKey: hold.stepKey ?? run.opened.openedByStep,
    used,
    limits,
  });

  if (hold.isReportWake || hold.target === null) {
    return;
  }

  const targetState = await readTaskState(tx, hold.target);

  if (targetState !== null && !isFinishedState(targetState)) {
    await writeInboxRecordsInTransaction(tx, context, [
      {
        kind: 'task.limit_notice',
        definitions: context.definitions(),
        thread: hold.target,
        payload: taskLimitNoticeCodec.encode({ taskID, used, limits }),
      },
    ]);
  }
}
