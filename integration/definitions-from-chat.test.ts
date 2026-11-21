import { expect, onTestFinished, test } from 'bun:test';
import {
  buildTaskDefineTool,
  buildTasksDefinitionsTool,
  readDefinitionNotices,
  undoDefinitionChange,
} from '@heynixie/definitions';
import { startTestDefinitions } from '@heynixie/definitions/test-utils';
import { parseJSONObject, readRecords } from '@heynixie/log';
import { createConversationTask } from '@heynixie/tasks';
import { waitForCondition } from '@heynixie/testing';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import { buildScheduleSource, deliverTriggerBatch } from '@heynixie/triggers';
import invariant from 'tiny-invariant';
import { z } from 'zod';

async function setupTest() {
  const ctx = await startTestDefinitions();

  // Monday, the week of the first Friday that the tests run to
  ctx.clock.advance(Date.parse('2027-03-08T00:00:00Z') - ctx.clock.now());

  const zone = { readZone: () => Promise.resolve('UTC') };
  const chatOptions = { readDefinitions: () => ctx.context, readZone: zone.readZone };
  const define = buildTaskDefineTool(chatOptions);
  const list = buildTasksDefinitionsTool(chatOptions);

  const source = buildScheduleSource({
    db: ctx.writer.db,
    clock: ctx.clock,
    readZone: zone.readZone,
    readLastMessageAt: () => Promise.resolve(null),
  });

  return {
    ...ctx,
    runDefine: (input: object) => {
      const call = buildMockToolCall({
        tool: 'task.define',
        input: parseJSONObject(JSON.stringify(input)),
      });

      return define.run(call, buildMockToolContext());
    },
    readIsInForce: async (definitionID: string) => {
      const outcome = await list.run(
        buildMockToolCall({ tool: 'tasks.definitions' }),
        buildMockToolContext(),
      );

      invariant(outcome.status === 'ok');

      const entrySchema = z.object({ definitionID: z.string(), isInForce: z.boolean() });
      const listSchema = z.object({ definitions: z.array(entrySchema) });
      const listed = listSchema.parse(outcome.result);

      return (
        listed.definitions.find((entry) => entry.definitionID === definitionID)?.isInForce ?? false
      );
    },
    readNotice: (changeID: string) =>
      readDefinitionNotices(ctx.writer.db, [changeID], {
        now: ctx.clock.now(),
        readZone: zone.readZone,
      }),
    readFired: () => readRecords(ctx.log, { afterSequence: 0, kinds: ['trigger.fired'] }),
    readSettled: () => readRecords(ctx.log, { afterSequence: 0, kinds: ['definition.settled'] }),
    waitForSettled: () =>
      waitForCondition(async () => {
        const found = await readRecords(ctx.log, {
          afterSequence: 0,
          kinds: ['definition.settled'],
        });

        return found.length === 1;
      }),
    readChanged: () => readRecords(ctx.log, { afterSequence: 0, kinds: ['definition.changed'] }),
    runFiresUntil: async (instant: string, count: number) => {
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

        return fired.length === count;
      });
    },
  };
}

test('it puts a definition in force from chat, writes its notice record and fires it on schedule', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  await createConversationTask(ctx.tasks);

  const outcome = await ctx.runDefine({
    name: 'Water the tomatoes',
    brief: 'Water the tomatoes.',
    trigger: {
      schedule: { repeat: { frequency: 'weekly', byDay: ['fri'], at: ['08:00'] }, zone: 'owner' },
    },
  });

  const changed = await ctx.readChanged();

  const [record] = changed;

  invariant(record);

  const notice = await ctx.readNotice(z.string().parse(record.record.payload['changeID']));

  await ctx.runFiresUntil('2027-03-12T08:01:00Z', 1);

  const isInForce = await ctx.readIsInForce('water-the-tomatoes');
  const fired = await ctx.readFired();

  expect({
    outcome,
    records: changed.length,
    notice: [...notice.values()],
    isInForce,
    fires: fired.length,
  }).toStrictEqual({
    outcome: {
      status: 'ok',
      result: {
        definitionID: 'water-the-tomatoes',
        rendered: 'every Friday at 08:00 (UTC)',
        next: 'Fri 12 Mar',
        changeID: expect.any(String),
      },
    },
    records: 1,
    notice: [
      expect.objectContaining({
        operation: 'add',
        rendered: 'every Friday at 08:00 (UTC)',
        state: 'in_force',
      }),
    ],
    isInForce: true,
    fires: 1,
  });
});

test('it takes a one-shot from chat out of force after its fire, and a later seed leaves it out', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  await ctx.runDefine({
    name: 'Book the dentist',
    brief: 'Book the dentist.',
    trigger: { at: '2027-03-12T08:00:00Z' },
  });

  await ctx.runFiresUntil('2027-03-12T08:01:00Z', 1);
  await ctx.waitForSettled();

  const settled = await ctx.readSettled();
  const outAfterFire = await ctx.readIsInForce('book-the-dentist');

  await ctx.seed();

  const outAfterSeed = await ctx.readIsInForce('book-the-dentist');

  expect({
    settled: settled.map((entry) => entry.record.payload),
    outAfterFire,
    outAfterSeed,
  }).toStrictEqual({
    settled: [
      {
        changeID: expect.any(String),
        definitionID: 'book-the-dentist',
        outcome: 'retired',
        cause: 'one_shot_fired',
        hash: null,
      },
    ],
    outAfterFire: false,
    outAfterSeed: false,
  });
});

test('it takes a one-shot from the files out of force after its fire, and a later seed leaves it out', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask(
    'book-the-dentist',
    `name: Book the dentist\nbrief: Book the dentist.\ntrigger:\n  at: "2027-03-12T08:00:00Z"\n`,
  );

  await ctx.seed();

  const before = await ctx.readIsInForce('book-the-dentist');

  await ctx.runFiresUntil('2027-03-12T08:01:00Z', 1);

  const outAfterFire = await ctx.readIsInForce('book-the-dentist');

  await ctx.seed();

  const outAfterSeed = await ctx.readIsInForce('book-the-dentist');
  const settled = await ctx.readSettled();

  expect({ before, outAfterFire, outAfterSeed, settled }).toStrictEqual({
    before: true,
    outAfterFire: false,
    outAfterSeed: false,
    settled: [],
  });
});

test('it refuses an undo of a one-shot from chat once it fired, as no longer in force', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  const outcome = await ctx.runDefine({
    name: 'Book the dentist',
    brief: 'Book the dentist.',
    trigger: { at: '2027-03-12T08:00:00Z' },
  });

  invariant(outcome.status === 'ok');

  await ctx.runFiresUntil('2027-03-12T08:01:00Z', 1);
  await ctx.waitForSettled();

  const undone = await undoDefinitionChange(
    ctx.context,
    z.string().parse(outcome.result['changeID']),
  );

  expect(undone).toStrictEqual({
    status: 'refused',
    refusal: { code: 'NOT_IN_FORCE', cause: 'one_shot_fired' },
  });
});
