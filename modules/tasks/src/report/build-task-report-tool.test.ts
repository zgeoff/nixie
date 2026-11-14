import { expect, test } from 'bun:test';
import type { JSONObject } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import invariant from 'tiny-invariant';
import { buildStepRunID } from '../step/build-step-run-id';
import { claimTask } from '../task/projection/claim-task';
import { seedConversationStep } from '../test-utils/seed-conversation-step';
import { seedTask } from '../test-utils/seed-task';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { buildTaskReportTool } from './build-task-report-tool';
import type { ReportShape } from './types';

async function setupTest() {
  const tasks = await startTestTasks();
  const starter = await seedConversationStep(tasks.context);

  return {
    ...tasks,
    startTask: async (shape?: Pick<ReportShape, 'properties' | 'required'>) => {
      const taskID = await seedTask(tasks.context, {
        starter: starter.claim,
        name: 'Tide tables',
        brief: 'Find the high tides for Saturday.',
        options:
          shape === undefined
            ? {}
            : { reportShape: { type: 'object', additionalProperties: false, ...shape } },
      });

      const claim = await claimTask(tasks.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

      invariant(claim, 'the started task is ready to claim');

      return {
        taskID,
        claim,
        callReport: (input: JSONObject) =>
          buildTaskReportTool(tasks.context).run(
            buildMockToolCall({ tool: 'task.report', input }),
            buildMockToolContext({ run: { thread: taskID, stepRunID: buildStepRunID(claim) } }),
          ),
      };
    },
    readRequests: () =>
      readRecords(tasks.context.log, {
        afterSequence: 0,
        kinds: ['task.run_report_requested'],
      }),
  };
}

test('it writes a report request that holds the words only in its erasable fields, and answers with the report ID', async () => {
  const ctx = await setupTest();

  const started = await ctx.startTask({
    properties: { city: { type: 'string' } },
    required: ['city'],
  });

  const outcome = await started.callReport({
    summary: '  High tide is at 06:42.  ',
    fields: { city: 'Lyon' },
  });

  const requests = await ctx.readRequests();

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { reportID: expect.toBeString() },
  });

  expect(requests.map((entry) => entry.record.erasable)).toStrictEqual([
    {
      status: 'readable',
      fields: { summary: 'High tide is at 06:42.', fields: { city: 'Lyon' } },
    },
  ]);

  expect(JSON.stringify(requests[0]?.record.payload)).not.toContain('06:42');
});

test('it refuses a second report request in the task run and gives the first report ID', async () => {
  const ctx = await setupTest();
  const started = await ctx.startTask();

  await started.callReport({ summary: 'High tide is at 06:42.' });

  const second = await started.callReport({ summary: 'Another one.' });
  const requests = await ctx.readRequests();

  const firstReportID = requests[0]?.record.payload['reportID'];

  invariant(typeof firstReportID === 'string');

  expect(second).toStrictEqual({
    status: 'error',
    message: `This run already sent its report as ${firstReportID}.`,
  });

  expect(requests).toHaveLength(1);
});

test('it refuses fields from a task that declares no report shape', async () => {
  const ctx = await setupTest();
  const started = await ctx.startTask();
  const outcome = await started.callReport({ summary: 'Done.', fields: { city: 'Lyon' } });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: expect.stringContaining('declares no report fields'),
  });

  const requests = await ctx.readRequests();

  expect(requests).toStrictEqual([]);
});

test('it refuses fields that do not match the shape, without repeating the value that was sent', async () => {
  const ctx = await setupTest();

  const started = await ctx.startTask({
    properties: { city: { type: 'string' } },
    required: ['city'],
  });

  const outcome = await started.callReport({ summary: 'Done.', fields: { city: 42 } });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: expect.stringContaining('do not match the shape'),
  });

  const requests = await ctx.readRequests();

  expect(requests).toStrictEqual([]);
});

test('it refuses a report whose fields are longer than the most characters', async () => {
  const ctx = await setupTest();
  const started = await ctx.startTask({ properties: { notes: { type: 'string' } } });

  const outcome = await started.callReport({
    summary: 'Done.',
    fields: { notes: 'x'.repeat(16_100) },
  });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: expect.stringContaining('the most is 16000'),
  });
});

test('it refuses a report from a step whose lease expired', async () => {
  const ctx = await setupTest();
  const started = await ctx.startTask();

  ctx.clock.advance(60_000);

  const outcome = await started.callReport({ summary: 'Done.' });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: expect.stringContaining('no longer holds its task'),
  });

  const requests = await ctx.readRequests();

  expect(requests).toStrictEqual([]);
});

test('it accepts a matching report after a call whose fields failed the shape, and the failed call ended nothing', async () => {
  const ctx = await setupTest();

  const started = await ctx.startTask({
    properties: { city: { type: 'string' } },
    required: ['city'],
  });

  await started.callReport({ summary: 'Done.', fields: { city: 42 } });

  const ended = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['task.run_ended'],
  });

  const second = await started.callReport({ summary: 'Done.', fields: { city: 'Lyon' } });
  const requests = await ctx.readRequests();

  expect(ended).toStrictEqual([]);
  expect(second).toStrictEqual({ status: 'ok', result: { reportID: expect.toBeString() } });
  expect(requests).toHaveLength(1);
});

test('it accepts a summary alone from a task that declares no report shape', async () => {
  const ctx = await setupTest();
  const started = await ctx.startTask();
  const outcome = await started.callReport({ summary: 'High tide is at 06:42.' });
  const requests = await ctx.readRequests();

  expect(outcome).toStrictEqual({ status: 'ok', result: { reportID: expect.toBeString() } });

  expect(requests.map((entry) => entry.record.erasable)).toStrictEqual([
    { status: 'readable', fields: { summary: 'High tide is at 06:42.' } },
  ]);
});

test('it records an empty input for a call, so the call record holds neither the summary nor the fields', async () => {
  const ctx = await setupTest();

  const tool = buildTaskReportTool(ctx.context);

  const recorded = tool.recordInput?.({
    summary: 'High tide is at 06:42.',
    fields: { city: 'Lyon' },
  });

  expect(recorded).toStrictEqual({});
});
