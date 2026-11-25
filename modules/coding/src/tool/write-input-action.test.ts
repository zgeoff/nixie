import { expect, test } from 'bun:test';
import { readTestActions } from '@heynixie/actions/test-utils';
import { buildStepRunID, writeTaskControl } from '@heynixie/tasks';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import invariant from 'tiny-invariant';
import { startTestCoding } from '../test-utils/start-test-coding';
import { readToolBinding } from './read-tool-binding';
import { writeInputAction } from './write-input-action';

async function setupTest() {
  const ctx = await startTestCoding();
  const claim = await ctx.claimConversation();

  return {
    ...ctx,
    claim,
    seed: {
      session: async (): Promise<string> => {
        const taskID = await ctx.startTask(claim, {
          runner: 'atc',
          name: 'Fix the flaky login test',
          brief: 'Find why the login test fails.',
          repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
        });

        await ctx.runActions();
        await ctx.runSteps();

        return taskID;
      },
    },
    readToolBinding: (taskID: string) => readToolBinding(ctx.coding, ctx.adapter, taskID),
    stop: (taskID: string) => writeTaskControl(ctx.context, { taskID, control: 'stop' }),
    writeSteer: (binding: Parameters<typeof writeInputAction>[1]['binding']) =>
      writeInputAction(ctx.coding, {
        name: 'coding.steer',
        kind: 'steer',
        call: buildMockToolCall({ tool: 'coding.steer' }),
        toolContext: buildMockToolContext({
          run: {
            thread: 'conversation',
            stepRunID: buildStepRunID(claim),
            tools: ['coding.steer'],
          },
        }),
        binding,
        text: 'Find why the cookie expires.',
      }),
    readSteers: async () => {
      const actions = await readTestActions(ctx.log.writer);

      return actions.filter((action) => action.tool === 'coding.steer');
    },
  };
}

test('it refuses a steer, and queues nothing, when the task stopped after the tool read its binding', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.session();
  const found = await ctx.readToolBinding(taskID);

  invariant(found.status === 'bound', 'the seeded task has a session');

  await ctx.stop(taskID);

  const queued = await ctx.writeSteer(found.binding);

  expect({ queued, steers: await ctx.readSteers() }).toStrictEqual({
    queued: { status: 'refused', sentence: `The task ${taskID} is stopped.` },
    steers: [],
  });
});
