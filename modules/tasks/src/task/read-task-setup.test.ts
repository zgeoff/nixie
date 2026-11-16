import { expect, test } from 'bun:test';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildStepRunID } from '../step/build-step-run-id';
import { seedConversationStep } from '../test-utils/seed-conversation-step';
import { seedDefinitionTask } from '../test-utils/seed-definition-task';
import { seedPausedTask } from '../test-utils/seed-paused-task';
import { seedTask } from '../test-utils/seed-task';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { taskCreatedCodec } from './codec/task-created-codec';
import { writeTaskLimitRaise } from './limit/write-task-limit-raise';
import { readTaskSetup } from './read-task-setup';
import { writeTaskStart } from './start/write-task-start';

function setupTest() {
  return startTestTasks();
}

test('it reads the starter, the options and the limits of a started task', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedTask(ctx.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find tides.',
    options: { persona: 'default', memory: 'read', limits: { turns: 12, dollars: 3 } },
  });

  const setup = await readTaskSetup(ctx.context, taskID);

  expect(setup).toStrictEqual({
    kind: 'started',
    runner: 'sandbox',
    startedBy: 'conversation',
    report: 'wake',
    options: {
      model: null,
      profile: null,
      persona: 'default',
      memory: 'read',
      tools: ['tasks.list', 'task.message', 'task.report', 'time.now'],
      report: 'wake',
      limits: { turns: 12, dollars: 3 },
    },
    limits: { turns: 12, dollars: 3 },
  });
});

test('it reads the limits of the newest raise', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedPausedTask(ctx.context, {
    starter: starter.claim,
    limits: { turns: 3, dollars: 1 },
  });

  await writeTaskLimitRaise(ctx.context, { taskID, limits: { turns: 9 } });

  const setup = await readTaskSetup(ctx.context, taskID);

  invariant(setup?.kind === 'started');

  expect(setup.limits).toStrictEqual({ turns: 9, dollars: 1 });
});

test('it reads a fixed setup for a task that no start started', async () => {
  const ctx = await setupTest();

  await seedConversationStep(ctx.context);

  const setup = await readTaskSetup(ctx.context, 'conversation');

  expect(setup).toStrictEqual({ kind: 'fixed' });
});

test('it reads no setup for an unknown task', async () => {
  const ctx = await setupTest();
  const setup = await readTaskSetup(ctx.context, 'k3vq8m2xpa');

  expect(setup).toBeNull();
});

test('it reads a started task with no report, limits or options for a task that a message moved to the user started', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, (tx) =>
    writeRecordsInTransaction(tx, ctx.context.log, [
      {
        kind: 'task.created',
        definitions: ctx.context.definitions(),
        thread: 'k3vq8m2xpa',
        payload: taskCreatedCodec.encode({
          taskID: 'k3vq8m2xpa',
          isConversation: false,
          state: 'ready',
          startedBy: 'conversation',
        }),
      },
    ]),
  );

  const setup = await readTaskSetup(ctx.context, 'k3vq8m2xpa');

  expect(setup).toStrictEqual({
    kind: 'started',
    runner: 'sandbox',
    startedBy: 'conversation',
    report: null,
    limits: null,
    options: null,
  });
});

test('it reads the runner, report and limits of a start that stored an envelope, with no options', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const outcome = await writeTaskStart(ctx.context, {
    from: 'conversation',
    name: 'Night watch',
    brief: 'Watch the build.',
    runner: 'watcher',
    stored: {
      kind: 'enveloped',
      envelope: { report: 'next_turn', limits: { turns: 4, dollars: 1 } },
      runnerOptions: { target: 'build' },
    },
    hopLimit: 6,
    stepRunID: buildStepRunID(starter.claim),
    disposable: false,
  });

  invariant(outcome.status === 'started');

  const setup = await readTaskSetup(ctx.context, outcome.taskID);

  expect(setup).toStrictEqual({
    kind: 'started',
    runner: 'watcher',
    startedBy: 'conversation',
    report: 'next_turn',
    limits: { turns: 4, dollars: 1 },
    options: null,
  });
});

test('it reads the definition and the hash in force of a definition task', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  const result = await readTaskSetup(ctx.context, taskID);

  expect(result).toStrictEqual({
    kind: 'definition',
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });
});

test('it reads a null hash for a definition task out of force', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: null,
  });

  const result = await readTaskSetup(ctx.context, taskID);

  expect(result).toStrictEqual({
    kind: 'definition',
    definitionID: 'water-the-tomatoes',
    definitionHash: null,
  });
});
