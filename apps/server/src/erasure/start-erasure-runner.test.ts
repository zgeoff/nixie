import { expect, mock, test } from 'bun:test';
import { proposalsProjection } from '@heynixie/api';
import { logProjections } from '@heynixie/log';
import { memoryProjections } from '@heynixie/memory';
import { createMemoryItem, startTestMemoryStore } from '@heynixie/memory/test-utils';
import { tasksProjections } from '@heynixie/tasks';
import {
  buildTaskSeeder,
  buildTestDefinitionReaders,
  buildTestRunSettings,
  buildTestTaskRunners,
} from '@heynixie/tasks/test-utils';
import { startTestTurnInputs } from '@heynixie/turn-inputs/test-utils';
import type { PartReader } from '../types';
import type { ErasureRunnerValues } from './start-erasure-runner';
import { startErasureRunner } from './start-erasure-runner';

async function setupTest() {
  const inputs = await startTestTurnInputs();

  await inputs.turnInputs.runStart();

  const context = {
    log: {
      ...inputs.log,
      projections: [
        ...logProjections,
        ...tasksProjections,
        ...memoryProjections,
        proposalsProjection,
      ],
    },
    clock: inputs.clock,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    runSettings: buildTestRunSettings(),
    ...buildTestDefinitionReaders(),
    runners: buildTestTaskRunners(),
  };

  const values: ErasureRunnerValues = {
    conversation_imp: { cleanupSessions: mock(() => Promise.resolve()) },
    sandbox_runner: { cleanupSessions: mock(() => Promise.resolve()) },
    memory: { finishEvidencePurges: mock(() => Promise.resolve()) },
    phone: { bindForget: mock(() => {}) },
  };

  const reader: PartReader<ErasureRunnerValues> = {
    get: (name) => values[name],
    find: (name) => values[name],
    waitFor: (name) => Promise.resolve(values[name]),
  };

  const runner = startErasureRunner(
    {
      context,
      turnInputs: inputs.turnInputs,
      tools: { adapter: { list: () => Promise.resolve([]) } },
      config: { backup: { isEnabled: false } },
    },
    reader,
  );

  return {
    seed: buildTaskSeeder({ context }),
    memory: await startTestMemoryStore(context, undefined, { erasure: runner }),

    // stores one request of a thread, as a step would
    writeInput: async (taskID: string, counter: number) => {
      const capture = await inputs.turnInputs.openCapture({
        step: { taskID, stepRunID: `${taskID}-step@1` },
        profile: inputs.profile,
        role: 'task',
        isRewritten: false,
      });

      await inputs.writeSpoolFile(capture.baseURL, { counter, body: new Uint8Array([counter]) });
      await capture.close({ callFrames: counter });
    },
    readStates: async () => {
      const list = await inputs.turnInputs.list(20);

      return list.inputs
        .toSorted((first, second) => first.intakeSequence - second.intakeSequence)
        .map((input) => [input.taskID, input.state, input.removedCause]);
    },
  };
}

test('it removes the requests of a forgotten memory item on the conversation and a cleaned task, and those on another thread taken in from its first record', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const cleaned = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: { memory: 'read' },
  });

  const other = await ctx.seed.task({
    starter: starter.claim,
    name: 'Bin days',
    brief: 'Find the bin days for March.',
    options: { memory: 'none' },
  });

  await ctx.writeInput('conversation', 1);
  await ctx.writeInput(cleaned, 2);
  await ctx.writeInput(other, 3);

  const item = await createMemoryItem(ctx.memory, { text: 'Keeps bees on the roof' });

  await ctx.writeInput(other, 4);

  await ctx.memory.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const states = await ctx.readStates();

  expect(states).toStrictEqual([
    ['conversation', 'removed', 'forget'],
    [cleaned, 'removed', 'forget'],
    [other, 'stored', null],
    [other, 'removed', 'forget'],
  ]);
});
