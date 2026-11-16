import { expect, onTestFinished, test } from 'bun:test';
import { runOracle, startSpawnedNixie } from '@heynixie/server/test-utils';
import { waitForCondition } from '@heynixie/testing';
import { z } from 'zod';

async function setupTest() {
  const nixie = await startSpawnedNixie({ isWorkerScripted: true });

  return { nixie };
}

test("it removes a worker's sandbox but not its caller's after a kill during the run, and counts the worker's finished calls in the caller's dollars", async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  await ctx.nixie.waitForQueueCheck();

  // The conversation's reply after its start and the task's first turn ask the model at about
  // the same time, so both get the same text.
  ctx.nixie.model.addReplies(
    {
      toolUse: {
        name: 'mcp__nixie__task_start',
        input: {
          name: 'Clock check',
          brief: 'Wait for my question.',
          tools: ['time.now', 'worker.run'],
        },
      },
    },
    { text: 'Noted.' },
    { text: 'Noted.' },
  );

  void first.request('sendMessage', { thread: 'conversation', text: 'Start a clock check.' });

  const created = await ctx.nixie.waitForRecord(
    (record) => record.kind === 'task.created' && record.payload['startedBy'] === 'conversation',
  );

  const taskID = String(created.payload['taskID']);

  await ctx.nixie.waitForRecord((record) => record.stepKey === `${taskID}:1`);
  await ctx.nixie.waitForRecord((record) => record.stepKey === 'conversation:1');

  const heldReply = Promise.withResolvers<void>();

  onTestFinished(() => {
    heldReply.resolve();
  });

  ctx.nixie.workerModel.addReplies(
    { toolUse: { name: 'mcp__nixie__time_now', input: {} } },
    { text: 'It is late.', gate: heldReply.promise },
  );

  ctx.nixie.model.addReplies({
    toolUse: {
      name: 'mcp__nixie__worker_run',
      input: { question: 'What time is it?', tools: ['time.now'] },
    },
  });

  void first.request('sendMessage', { thread: taskID, text: 'What time is it?' });

  await waitForCondition(() => ctx.nixie.workerModel.requests.length >= 2);

  await ctx.nixie.waitForRecord((record) => record.kind === 'worker.turn_ended');
  await first.kill();

  ctx.nixie.model.addReplies(
    { toolUse: { name: 'mcp__nixie__task_report', input: { summary: 'Checked.' } } },
    { text: 'Done.' },
  );

  const second = ctx.nixie.harness.start();

  await second.ready;

  const ended = await ctx.nixie.waitForRecord(
    (record) => record.kind === 'task.run_ended' && record.thread === taskID,
  );

  await second.kill();

  const records = await ctx.nixie.readRecords();
  const oracle = await runOracle(ctx.nixie);

  const sandboxes = records
    .filter((record) => record.kind === 'sandbox.created')
    .map((record) => ({
      sandboxID: String(record.payload['sandboxID']),
      owner: JSON.stringify(record.payload),
    }));

  const worker = sandboxes.find((sandbox) => sandbox.owner.includes('"owner":"worker_run:'));
  const caller = sandboxes.find((sandbox) => sandbox.owner.includes(`"owner":"${taskID}"`));

  const destroyed = records
    .filter((record) => record.kind === 'sandbox.destroyed')
    .map((record) => record.payload['sandboxID']);

  const workerDollars = records
    .filter((record) => record.kind === 'worker.turn_ended')
    .reduce((sum, record) => sum + Number(record.payload['dollars']), 0);

  const usedDollars = z.object({ dollars: z.number() }).parse(ended.payload['used']).dollars;

  expect(worker).toBeDefined();
  expect(caller).toBeDefined();
  expect(destroyed).toContain(worker?.sandboxID);
  expect(destroyed).not.toContain(caller?.sandboxID);
  expect(workerDollars).toBeGreaterThan(0);
  expect(usedDollars).toBeGreaterThanOrEqual(workerDollars);

  expect(oracle).toStrictEqual({
    repeatedStepKeys: [],
    repeatedActions: [],
    strayCalls: [],
    heldLeases: [],
    unreadyTasks: [],
    changedEndStates: [],
    projectionDrift: [],
  });
});
