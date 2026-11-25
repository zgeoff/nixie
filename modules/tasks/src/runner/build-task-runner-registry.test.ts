import { expect, test } from 'bun:test';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildStepRunID } from '../step/build-step-run-id';
import { taskCreatedCodec } from '../task/codec/task-created-codec';
import { createTask } from '../task/create-task';
import { writeTaskStart } from '../task/start/write-task-start';
import { makeStubStep } from '../test-utils/make-stub-step';
import { seedClosedTask } from '../test-utils/seed-closed-task';
import { seedConversationStep } from '../test-utils/seed-conversation-step';
import { seedDefinitionTask } from '../test-utils/seed-definition-task';
import { seedTask } from '../test-utils/seed-task';
import { startTestTasks } from '../test-utils/start-test-tasks';
import type { StartedClaim, StepInput, StepResult } from '../types';
import { conversationTaskID } from '../utils/conversation-task-id';
import { buildTaskRunnerRegistry } from './build-task-runner-registry';
import { conversationRunner } from './conversation-runner';
import { sandboxRunner } from './sandbox-runner';

async function setupTest() {
  const tasks = await startTestTasks();

  const result: StepResult = { next: 'wait', records: [], acknowledged: [] };

  const seed = {
    // a started task whose record has no runner, as every task of an earlier release
    unrunnerTask: async (taskID: string) => {
      await withWriteTransaction(tasks.writer, (tx) =>
        writeRecordsInTransaction(tx, tasks.context.log, [
          {
            kind: 'task.created',
            definitions: tasks.context.definitions(),
            thread: taskID,
            payload: taskCreatedCodec.encode({
              taskID,
              isConversation: false,
              state: 'ready',
              startedBy: conversationTaskID,
            }),
          },
        ]),
      );
    },
    watcherTask: async (starter: StartedClaim) => {
      const outcome = await writeTaskStart(tasks.context, {
        from: conversationTaskID,
        name: 'Night watch',
        brief: 'Watch the build.',
        runner: 'watcher',
        stored: {
          kind: 'enveloped',
          envelope: { report: 'wake', limits: { turns: 4, dollars: 1 } },
          runnerOptions: { target: 'build' },
        },
        hopLimit: 6,
        stepRunID: buildStepRunID(starter),
        disposable: false,
      });

      invariant(outcome.status === 'started');

      return outcome.taskID;
    },
  };

  return {
    ...tasks,
    result,
    buildInput: (taskID: string): StepInput => ({
      run: null,
      taskID,
      stepKey: `${taskID}:1`,
      lease: {
        kind: 'task',
        workID: taskID,
        holder: 'runner-a',
        generation: 1,
        epoch: 1,
        expiresAt: 2_000_000,
      },
      inbox: [],
      wake: { hop: 0, cause: { kind: 'owner' } },
      sessionBoundary: null,
      signal: new AbortController().signal,
      interrupt: new AbortController().signal,
    }),
    seed,
  };
}

test('it lists the definitions with a start, in the order they were given', () => {
  const watcher = {
    key: 'watcher',
    controls: [],
    start: null,
    fixedTasks: [],
    keepsSandboxes: false,
    meters: [],
    ended: null,
    listFields: null,
  };

  const registry = buildTaskRunnerRegistry({
    definitions: [watcher, sandboxRunner, conversationRunner],
    defaultRunner: sandboxRunner,
  });

  expect(registry.startable.map((runner) => runner.key)).toStrictEqual(['sandbox']);
});

test('it refuses 2 definitions with one key', () => {
  const duplicate = { ...conversationRunner, fixedTasks: [] };

  expect(() =>
    buildTaskRunnerRegistry({
      definitions: [conversationRunner, duplicate, sandboxRunner],
      defaultRunner: sandboxRunner,
    }),
  ).toThrowWithMessage(Error, 'two task runners share the key conversation');
});

test('it refuses 2 definitions with one fixed task', () => {
  const other = { ...conversationRunner, key: 'other' };

  expect(() =>
    buildTaskRunnerRegistry({
      definitions: [conversationRunner, other, sandboxRunner],
      defaultRunner: sandboxRunner,
    }),
  ).toThrowWithMessage(Error, `two task runners share the fixed task ${conversationTaskID}`);
});

test('it refuses a default runner that no definition holds', () => {
  expect(() =>
    buildTaskRunnerRegistry({ definitions: [conversationRunner], defaultRunner: sandboxRunner }),
  ).toThrowWithMessage(Error, 'the default task runner sandbox is not in the definitions');
});

test('it resolves a started task with no stored runner to the default runner', async () => {
  const ctx = await setupTest();

  await seedConversationStep(ctx.context);

  await ctx.seed.unrunnerTask('k3vq8m2xpa');

  const registry = buildTaskRunnerRegistry({
    definitions: [conversationRunner, sandboxRunner],
    defaultRunner: sandboxRunner,
  });

  const resolved = await registry.resolve(ctx.context, 'k3vq8m2xpa');

  expect(resolved).toStrictEqual({
    status: 'found',
    definition: sandboxRunner,
  });
});

test('it resolves a fixed task to the definition that lists it', async () => {
  const ctx = await setupTest();

  await seedConversationStep(ctx.context);

  const registry = buildTaskRunnerRegistry({
    definitions: [conversationRunner, sandboxRunner],
    defaultRunner: sandboxRunner,
  });

  const resolved = await registry.resolve(ctx.context, conversationTaskID);

  expect(resolved).toStrictEqual({
    status: 'found',
    definition: conversationRunner,
  });
});

test('it resolves a task to the definition that its stored runner names', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const watcher = {
    key: 'watcher',
    controls: [],
    start: null,
    fixedTasks: [],
    keepsSandboxes: false,
    meters: [],
    ended: null,
    listFields: null,
  };

  const taskID = await ctx.seed.watcherTask(starter.claim);

  const registry = buildTaskRunnerRegistry({
    definitions: [conversationRunner, sandboxRunner, watcher],
    defaultRunner: sandboxRunner,
  });

  const resolved = await registry.resolve(ctx.context, taskID);

  expect(resolved).toStrictEqual({
    status: 'found',
    definition: watcher,
  });
});

test('it resolves a task whose stored runner names no definition to the unknown key', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);
  const taskID = await ctx.seed.watcherTask(starter.claim);

  const registry = buildTaskRunnerRegistry({
    definitions: [conversationRunner, sandboxRunner],
    defaultRunner: sandboxRunner,
  });

  const resolved = await registry.resolve(ctx.context, taskID);

  expect(resolved).toStrictEqual({
    status: 'unknown',
    key: 'watcher',
  });
});

test('it resolves a task that no runner owns and an unknown task to none', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'A task with no starter.');

  const registry = buildTaskRunnerRegistry({
    definitions: [conversationRunner, sandboxRunner],
    defaultRunner: sandboxRunner,
  });

  const resolved = await Promise.all([
    registry.resolve(ctx.context, taskID),
    registry.resolve(ctx.context, 'k3vq8m2xpa'),
  ]);

  expect(resolved).toStrictEqual([{ status: 'none' }, { status: 'none' }]);
});

test('it refuses to bind a definition that has no step', async () => {
  const ctx = await setupTest();

  const registry = buildTaskRunnerRegistry({
    definitions: [conversationRunner, sandboxRunner],
    defaultRunner: sandboxRunner,
  });

  expect(() =>
    registry.bindSteps(
      ctx.context,
      [{ definition: sandboxRunner, runStep: () => Promise.resolve(ctx.result) }],
      () => Promise.resolve(ctx.result),
    ),
  ).toThrowWithMessage(Error, 'the task runner conversation has no step');
});

test('it refuses to bind a step to a definition the registry lacks', async () => {
  const ctx = await setupTest();

  const registry = buildTaskRunnerRegistry({
    definitions: [sandboxRunner],
    defaultRunner: sandboxRunner,
  });

  const runStep = () => Promise.resolve(ctx.result);

  expect(() =>
    registry.bindSteps(
      ctx.context,
      [
        { definition: sandboxRunner, runStep },
        { definition: conversationRunner, runStep },
      ],
      runStep,
    ),
  ).toThrowWithMessage(
    Error,
    'a step is bound to the task runner conversation, which has no definition',
  );
});

test('it refuses to bind 2 steps to one definition', async () => {
  const ctx = await setupTest();

  const registry = buildTaskRunnerRegistry({
    definitions: [sandboxRunner],
    defaultRunner: sandboxRunner,
  });

  const runStep = () => Promise.resolve(ctx.result);

  expect(() =>
    registry.bindSteps(
      ctx.context,
      [
        { definition: sandboxRunner, runStep },
        { definition: sandboxRunner, runStep },
      ],
      runStep,
    ),
  ).toThrowWithMessage(Error, 'the task runner sandbox has two steps');
});

test('it runs the step of the runner that owns the task, and the fallback for a task no runner owns', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedTask(ctx.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const registry = buildTaskRunnerRegistry({
    definitions: [conversationRunner, sandboxRunner],
    defaultRunner: sandboxRunner,
  });

  const seen: string[][] = [[], [], []];

  const conversationStep = makeStubStep((input) => {
    seen[0]?.push(input.taskID);

    return Promise.resolve();
  });

  const sandboxStep = makeStubStep((input) => {
    seen[1]?.push(input.taskID);

    return Promise.resolve();
  });

  const fallbackStep = makeStubStep((input) => {
    seen[2]?.push(input.taskID);

    return Promise.resolve();
  });

  const runStep = registry.bindSteps(
    ctx.context,
    [
      { definition: conversationRunner, runStep: conversationStep },
      { definition: sandboxRunner, runStep: sandboxStep },
    ],
    fallbackStep,
  );

  await runStep(ctx.buildInput(conversationTaskID));
  await runStep(ctx.buildInput(taskID));
  await runStep(ctx.buildInput('k3vq8m2xpa'));

  expect(seen).toStrictEqual([[conversationTaskID], [taskID], ['k3vq8m2xpa']]);
});

test('it throws in the step of a task whose stored runner names no definition', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);
  const taskID = await ctx.seed.watcherTask(starter.claim);

  const registry = buildTaskRunnerRegistry({
    definitions: [conversationRunner, sandboxRunner],
    defaultRunner: sandboxRunner,
  });

  const runStep = registry.bindSteps(
    ctx.context,
    [
      { definition: conversationRunner, runStep: () => Promise.resolve(ctx.result) },
      { definition: sandboxRunner, runStep: () => Promise.resolve(ctx.result) },
    ],
    () => Promise.resolve(ctx.result),
  );

  const [settled] = await Promise.allSettled([runStep(ctx.buildInput(taskID))]);

  expect(settled).toStrictEqual({
    status: 'rejected',
    reason: new Error(`the task ${taskID} names the runner watcher, which has no definition`),
  });
});

test('it keeps the sandboxes of the fixed tasks and the open started tasks of each runner that keeps sandboxes', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const open = await seedTask(ctx.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  await seedClosedTask(ctx.context, {
    starter: starter.claim,
    name: 'Moon phases',
    brief: 'Find the moon phases.',
  });

  const registry = buildTaskRunnerRegistry({
    definitions: [
      conversationRunner,
      sandboxRunner,
      {
        key: 'queue-check',
        controls: [],
        start: null,
        fixedTasks: ['queue-check'],
        keepsSandboxes: false,
        meters: [],
        ended: null,
        listFields: null,
      },
    ],
    defaultRunner: sandboxRunner,
  });

  const resolved = await registry.readKeptSandboxOwners(ctx.context);

  expect(resolved).toStrictEqual([conversationTaskID, open]);
});

test('it keeps no sandbox for an open started task whose runner does not keep them', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  await ctx.seed.watcherTask(starter.claim);

  const watcher = {
    key: 'watcher',
    controls: [],
    start: null,
    fixedTasks: [],
    keepsSandboxes: false,
    meters: [],
    ended: null,
    listFields: null,
  };

  const registry = buildTaskRunnerRegistry({
    definitions: [conversationRunner, sandboxRunner, watcher],
    defaultRunner: sandboxRunner,
  });

  const resolved = await registry.readKeptSandboxOwners(ctx.context);

  expect(resolved).toStrictEqual([conversationTaskID]);
});

test('it resolves the task of a definition to the default runner', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  const resolution = await ctx.context.runners.resolve(ctx.context, taskID);

  expect(resolution).toStrictEqual({ status: 'found', definition: sandboxRunner });
});
