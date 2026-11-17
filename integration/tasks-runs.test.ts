import { expect, onTestFinished, test } from 'bun:test';
import {
  buildTaskDefineTool,
  buildTasksDefinitionsTool,
  makeReadDefinitionRunPolicy,
  readDefinitionVersion,
} from '@heynixie/definitions';
import { startTestDefinitions } from '@heynixie/definitions/test-utils';
import { parseJSONObject, readRecords } from '@heynixie/log';
import { buildTasksRunsTool, claimTask, writeStepCommit } from '@heynixie/tasks';
import { waitForCondition } from '@heynixie/testing';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import { buildScheduleSource, deliverTriggerBatch } from '@heynixie/triggers';
import invariant from 'tiny-invariant';
import { z } from 'zod';

async function setupTest() {
  const definitionSchema = z.object({ definitionID: z.string() });
  const definitionsSchema = z.object({ definitions: z.array(definitionSchema) });

  const ctx = await startTestDefinitions();

  ctx.clock.advance(Date.parse('2027-03-08T00:00:00Z') - ctx.clock.now());

  const chatOptions = {
    readDefinitions: () => ctx.context,
    readZone: () => Promise.resolve('UTC'),
  };

  const define = buildTaskDefineTool(chatOptions);
  const list = buildTasksDefinitionsTool(chatOptions);

  const tasks = {
    ...ctx.tasks,
    readDefinitionVersion,
    readDefinitionRunPolicy: makeReadDefinitionRunPolicy({ turns: 25, dollars: 2 }),
  };

  const runs = buildTasksRunsTool(tasks, { directory: [] });

  const source = buildScheduleSource({
    db: ctx.writer.db,
    clock: ctx.clock,
    readZone: () => Promise.resolve('UTC'),
    readLastMessageAt: () => Promise.resolve(null),
  });

  return {
    ...ctx,
    tasks,
    runDefine: (input: object) => {
      const parsed = parseJSONObject(JSON.stringify(input));
      const call = buildMockToolCall({ tool: 'task.define', input: parsed });

      return define.run(call, buildMockToolContext());
    },
    readDefinitionIDs: async () => {
      const outcome = await list.run(
        buildMockToolCall({ tool: 'tasks.definitions' }),
        buildMockToolContext(),
      );

      invariant(outcome.status === 'ok');

      const listed = definitionsSchema.parse(outcome.result);

      return listed.definitions.map((entry) => entry.definitionID);
    },
    readRuns: () =>
      runs.run(
        buildMockToolCall({ tool: 'tasks.runs', input: {} }),
        buildMockToolContext({ run: { thread: 'conversation' } }),
      ),
    fireOnce: async (instant: string) => {
      const controller = new AbortController();

      onTestFinished(async () => {
        controller.abort();

        await source.stop();
      });

      await source.start({
        cursor: null,
        deliver: (batch) => deliverTriggerBatch(ctx.core, 'schedule', batch),
        reportHealth: () => {},
        signal: controller.signal,
      });

      await waitForCondition(() => ctx.clock.countSleepers() === 1);

      ctx.clock.advance(Date.parse(instant) - ctx.clock.now());

      await waitForCondition(async () => {
        const fired = await readRecords(ctx.log, { afterSequence: 0, kinds: ['trigger.fired'] });

        return fired.length === 1;
      });
    },
    waitForSettled: () =>
      waitForCondition(async () => {
        const found = await readRecords(ctx.log, {
          afterSequence: 0,
          kinds: ['definition.settled'],
        });

        return found.length === 1;
      }),
  };
}

test('it lists the ended run of a one-off after its definition left the definitions list, with its name and the source one-off', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  await ctx.runDefine({
    name: 'Book the dentist',
    brief: 'Book the dentist.',
    target: 'task',
    trigger: { at: '2027-03-12T08:00:00Z' },
  });

  const before = await ctx.readDefinitionIDs();

  await ctx.fireOnce('2027-03-12T08:01:00Z');
  await ctx.waitForSettled();

  const claim = await claimTask(ctx.tasks, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(claim, 'the fire is ready to claim');

  await writeStepCommit(ctx.tasks, claim, {
    next: 'wait',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', report: { summary: 'Booked the dentist for Tuesday.' } },
  });

  const after = await ctx.readDefinitionIDs();
  const listed = await ctx.readRuns();

  expect({ before, after, listed }).toStrictEqual({
    before: ['book-the-dentist'],
    after: [],
    listed: {
      status: 'ok',
      result: {
        runs: [
          {
            run: expect.toBeString(),
            task: claim.lease.workID,
            name: 'Book the dentist',
            source: 'one-off',
            startedAt: expect.toBeString(),
            endedAt: expect.toBeString(),
            outcome: 'done',
            report: 'Booked the dentist for Tuesday.',
            isReportClipped: false,
          },
        ],
        nextCursor: null,
      },
    },
  });
});
