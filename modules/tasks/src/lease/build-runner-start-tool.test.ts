import { expect, test } from 'bun:test';
import { z } from 'zod';
import { buildTaskRunnerRegistry } from '../runner/build-task-runner-registry';
import { defineRunnerStart } from '../runner/define-runner-start';
import { sandboxRunner } from '../runner/sandbox-runner';
import type { TaskRunnerDefinition } from '../runner/types';
import { buildMockTaskStartBounds } from '../test-utils/build-mock-task-start-bounds';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { buildRunnerStartTool } from './build-runner-start-tool';

async function setupTest() {
  const tasks = await startTestTasks();

  const secondRunner: TaskRunnerDefinition = {
    ...sandboxRunner,
    key: 'atc',
    start: defineRunnerStart({
      schema: z.strictObject({ runner: z.literal('atc'), name: z.string(), brief: z.string() }),
      describeInput: () => ({
        type: 'object',
        properties: { runner: { type: 'string', const: 'atc' } },
      }),
      declaration: {
        effects: ['note'],
        destinations: [],
        amount: null,
        content: ['name', 'brief'],
        results: {},
      },
      storesBuiltOptions: false,
      plan: () => Promise.resolve({ status: 'refused', sentence: 'not planned in this test' }),
      encodeOptions: () => ({}),
    }),
  };

  return {
    // the default sandbox runner and a second runner that a start can pick
    twoRunnersContext: {
      ...tasks.context,
      runners: buildTaskRunnerRegistry({
        definitions: [sandboxRunner, secondRunner],
        defaultRunner: sandboxRunner,
      }),
    },
  };
}

test("it advertises a second runner's start as a tool of its own under its own name, with that runner's input", async () => {
  const ctx = await setupTest();

  const tool = buildRunnerStartTool(
    ctx.twoRunnersContext,
    { hopLimit: 20, ownerName: null },
    buildMockTaskStartBounds(),
    { name: 'atc.start', description: 'Starts an atc task.', runner: 'atc' },
  );

  expect([tool.name, tool.input, tool.variants]).toStrictEqual([
    'atc.start',
    { type: 'object', properties: { runner: { type: 'string', const: 'atc' } } },
    undefined,
  ]);
});
