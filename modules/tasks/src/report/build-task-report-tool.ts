import { createShortID } from '@heynixie/db';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { JSONObject } from '@heynixie/log';
import type { ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { buildSchemaParser } from '@heynixie/tools';
import { z } from 'zod';
import { readOpenRun } from '../run/read-open-run';
import { taskRunReportRequestedCodec } from '../run/task-run-report-requested-codec';
import { readLeasedStepHop } from '../step/read-leased-step-hop';
import type { TasksContext } from '../types';
import { parseStepRunID } from '../utils/parse-step-run-id';
import { maxReportFieldCharacters, reportCallRefusals } from './report-call-refusals';
import { taskReportToolName } from './task-report-tool-name';
import type { ReportShape } from './types';

const reportArguments = z.object({
  summary: z.string(),
  fields: z.record(z.string(), z.json()).optional(),
});

// The tool has one input schema for every task, with no report shape in it, because the registry
// holds one definition per tool name. The task's pinned shape checks the fields in the call.
export function buildTaskReportTool(
  context: Pick<TasksContext, 'clock' | 'definitions' | 'log'>,
): ToolDefinition {
  return {
    name: taskReportToolName,
    description:
      'Ends your run with a report to the task that started you. Pass a summary of what you did ' +
      'and found, and, when the run declares report fields, pass fields that match the schema it ' +
      'gives you. nixie checks only that the fields match the schema, never that they are true. A ' +
      'run sends one report, and nixie ends the run once your turn is over.',
    input: {
      type: 'object',
      properties: {
        summary: { type: 'string', minLength: 1, maxLength: 8000 },
        fields: { type: 'object' },
      },
      required: ['summary'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: { reportID: { type: 'string' } },
      required: ['reportID'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: ['summary', 'fields'],
      results: { reportID: 'owner_data' },
    },
    execution: 'direct',

    // The summary and the fields sit in the request record's erasable fields, so a call record
    // never holds them.
    recordInput: () => ({}),

    run: async (call, tool): Promise<ToolOutcome> => {
      const input = reportArguments.parse(call.input);
      const summary = input.summary.trim();

      if (summary === '') {
        return { status: 'error', message: reportCallRefusals.emptySummary };
      }

      const run = await readOpenRun(context.log.writer.db, tool.run.thread);

      if (run === null) {
        return { status: 'error', message: reportCallRefusals.noRun };
      }

      const refusal = pickFieldsRefusal(run.opened.reportShape, input.fields);

      if (refusal !== null) {
        return { status: 'error', message: refusal };
      }

      return writeReportRequest(context, {
        taskID: tool.run.thread,
        stepRunID: tool.run.stepRunID ?? null,
        summary,
        fields: input.fields,
      });
    },
  };
}

const noFields: JSONObject = {};

// The check reads only the call and the pinned shape, and fields left out count as an empty
// object, so a shape with no required field accepts a summary alone.
function pickFieldsRefusal(
  shape: ReportShape | null,
  fields: JSONObject | undefined,
): string | null {
  if (shape === null) {
    return fields === undefined ? null : reportCallRefusals.noShape;
  }

  const size = JSON.stringify(fields ?? noFields).length;

  if (size > maxReportFieldCharacters) {
    return reportCallRefusals.size.replace('{n}', String(size));
  }

  const checked = buildSchemaParser(shape)(fields ?? noFields);

  return checked.isValid
    ? null
    : reportCallRefusals.mismatch
        .replace('{faults}', () => `${checked.errors}.`)
        .replace('{schema}', () => JSON.stringify(shape));
}

interface ReportRequest {
  readonly taskID: string;
  readonly stepRunID: string | null;
  readonly summary: string;
  readonly fields: JSONObject | undefined;
}

// One write transaction refuses a step whose lease expired, refuses a second request in the task
// run with the first reportID, and otherwise writes the request. Of 2 calls in one turn, only the
// first writes.
function writeReportRequest(
  context: Pick<TasksContext, 'clock' | 'definitions' | 'log'>,
  request: ReportRequest,
): Promise<ToolOutcome> {
  return withWriteTransaction(context.log.writer, async (tx): Promise<ToolOutcome> => {
    const step = request.stepRunID === null ? null : parseStepRunID(request.stepRunID);

    const hop =
      step === null ? null : await readLeasedStepHop(tx, request.taskID, step, context.clock.now());

    if (step === null || hop === null) {
      return { status: 'error', message: reportCallRefusals.staleStep };
    }

    const run = await readOpenRun(tx, request.taskID);

    if (run === null) {
      return { status: 'error', message: reportCallRefusals.noRun };
    }

    if (run.reportID !== null) {
      return {
        status: 'error',
        message: reportCallRefusals.second.replace('{reportID}', run.reportID),
      };
    }

    const reportID = createShortID();

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: taskRunReportRequestedCodec.kind,
        definitions: context.definitions(),
        thread: request.taskID,
        payload: taskRunReportRequestedCodec.encode({
          taskID: request.taskID,
          runID: run.runID,
          stepKey: step.stepKey,
          reportID,
        }),
        erasable: {
          summary: request.summary,
          ...(request.fields === undefined ? {} : { fields: request.fields }),
        },
      },
    ]);

    return { status: 'ok', result: { reportID } };
  });
}
