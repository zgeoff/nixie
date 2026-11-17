import { expect, onTestFinished, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { writeTaskControl } from '@heynixie/tasks';
import { readTestTasks } from '@heynixie/tasks/test-utils';
import { waitForCondition } from '@heynixie/testing';
import { buildScheduleSource, deliverTriggerBatch } from '@heynixie/triggers';
import invariant from 'tiny-invariant';
import { buildTestDefineInput } from '../test-utils/build-test-define-input';
import { readTestRuntimeTasks } from '../test-utils/read-test-runtime-tasks';
import { startTestDefinitions } from '../test-utils/start-test-definitions';
import { requestDefinitionChange } from './request-definition-change';

async function setupTest() {
  const ctx = await startTestDefinitions();

  const source = buildScheduleSource({
    db: ctx.writer.db,
    clock: ctx.clock,
    readZone: () => Promise.resolve('UTC'),
    readLastMessageAt: () => Promise.resolve(null),
  });

  const startSource = async () => {
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
  };

  return {
    ...ctx,
    startSource,
    readSettled: () => readRecords(ctx.log, { afterSequence: 0, kinds: ['definition.settled'] }),
  };
}

test('it settles a runtime one-shot as retired with one_shot_skipped when its task is held', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  const defined = await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: buildTestDefineInput({
      name: 'Book the dentist',
      brief: 'Book the dentist.',
      trigger: { at: '2026-10-17T08:00:00Z' },
    }),
  });

  invariant(defined.status === 'changed');

  const [task] = await readTestTasks(ctx.writer);

  invariant(task);

  await writeTaskControl(ctx.tasks, { taskID: task.id, control: 'pause' });

  ctx.clock.advance(Date.parse('2026-10-17T08:01:00Z') - ctx.clock.now());

  await ctx.startSource();

  await waitForCondition(async () => {
    const found = await ctx.readSettled();

    return found.length === 1;
  });

  const settled = await ctx.readSettled();
  const rows = await readTestRuntimeTasks(ctx.writer);

  expect(settled.map((entry) => entry.record.payload)).toStrictEqual([
    {
      changeID: defined.changeID,
      definitionID: 'book-the-dentist',
      outcome: 'retired',
      cause: 'one_shot_skipped',
      hash: null,
    },
  ]);

  expect(rows.map((row) => [row.state, row.state_cause])).toStrictEqual([
    ['retired', 'one_shot_skipped'],
  ]);
});

test('it settles a runtime one-shot as retired with one_shot_fired when its task runs it', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: buildTestDefineInput({
      name: 'Book the dentist',
      brief: 'Book the dentist.',
      trigger: { at: '2026-10-17T08:00:00Z' },
    }),
  });

  ctx.clock.advance(Date.parse('2026-10-17T08:01:00Z') - ctx.clock.now());

  await ctx.startSource();

  await waitForCondition(async () => {
    const found = await ctx.readSettled();

    return found.length === 1;
  });

  const settled = await ctx.readSettled();

  expect(settled.map((entry) => entry.record.payload['cause'])).toStrictEqual(['one_shot_fired']);
});

test('it settles nothing for a one-shot that the repo holds', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask(
    'book-the-dentist',
    'name: Book the dentist\nbrief: Book the dentist.\ntrigger:\n  at: "2026-10-17T08:00:00Z"\n',
  );

  await ctx.seed();

  ctx.clock.advance(Date.parse('2026-10-17T08:01:00Z') - ctx.clock.now());

  await ctx.startSource();

  await waitForCondition(async () => {
    const fired = await readRecords(ctx.log, { afterSequence: 0, kinds: ['trigger.fired'] });

    return fired.length === 1;
  });

  const settled = await ctx.readSettled();

  expect(settled).toStrictEqual([]);
});
