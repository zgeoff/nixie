import { expect, onTestFinished, test } from 'bun:test';
import { triggerSchema } from '@heynixie/contract';
import {
  pauseNixieInTransaction,
  readRecords,
  resumeNixieInTransaction,
  withWriteTransaction,
} from '@heynixie/log';
import { buildLogSeeder } from '@heynixie/log/test-utils';
import { writeTaskControl } from '@heynixie/tasks';
import { seedDefinitionTask } from '@heynixie/tasks/test-utils';
import { waitForCondition } from '@heynixie/testing';
import { deliverTriggerBatch } from '../core/deliver-trigger-batch';
import {
  buildTestArmedDefinition,
  buildTestTriggerEvent,
  readTestTriggerRows,
  seedArmedDefinitions,
  seedDefinitionsInForce,
  startTestTriggers,
} from '../test-utils';
import type { SourceHealth, TriggerBatch } from '../types';
import { buildScheduleSource } from './build-schedule-source';

async function setupTest() {
  const triggers = await startTestTriggers();

  const owner = { zone: 'UTC' };
  const lastMessage: { at: number | null } = { at: null };
  const failure = { isOn: false };

  const readLastMessageAt = () => {
    const outcome = failure.isOn
      ? Promise.reject(new Error('the read failed'))
      : Promise.resolve(lastMessage.at);

    return outcome;
  };

  const batches: TriggerBatch[] = [];
  const health: SourceHealth[] = [];

  const buildSource = (readLast: () => Promise<number | null> = readLastMessageAt) =>
    buildScheduleSource({
      db: triggers.writer.db,
      clock: triggers.clock,
      readZone: (zone) => {
        const resolved = zone === 'owner' ? owner.zone : zone;

        return Promise.resolve(resolved);
      },
      readLastMessageAt: readLast,
    });

  const startSource = async (source = buildSource()) => {
    const controller = new AbortController();

    onTestFinished(async () => {
      controller.abort();

      await source.stop();
    });

    await source.start({
      cursor: null,
      deliver: (batch) => {
        batches.push(batch);

        return deliverTriggerBatch(triggers.core, 'schedule', batch);
      },
      reportHealth: (next) => {
        health.push(next);
      },
      signal: controller.signal,
    });

    return source;
  };

  // The source sleeps again once its tick, and the delivery in it, has ended.
  const settle = () => waitForCondition(() => triggers.clock.countPending() === 1);

  const advance = async (durationMs: number) => {
    triggers.clock.advance(durationMs);

    await settle();
  };

  const armTaskDefinition = async (trigger: unknown) => {
    await seedDefinitionTask(triggers, {
      definitionID: 'water-the-tomatoes',
      definitionHash: 'hash-1',
    });

    await seedArmedDefinitions(triggers, [
      buildTestArmedDefinition({ trigger: triggerSchema.parse(trigger) }),
    ]);
  };

  const definitions = { snapshotHash: 'sha256:test' };

  const pauseNixie = () =>
    withWriteTransaction(triggers.writer, (tx) =>
      pauseNixieInTransaction(tx, triggers.context.log, {
        cause: 'owner',
        recoveryID: null,
        by: 'session-a',
        definitions,
      }),
    );

  const resumeNixie = () =>
    withWriteTransaction(triggers.writer, (tx) =>
      resumeNixieInTransaction(tx, triggers.context.log, { by: 'session-a', definitions }),
    );

  return {
    ...triggers,
    pauseNixie,
    resumeNixie,
    seed: buildLogSeeder(triggers.context),
    armTaskDefinition,
    owner,
    lastMessage,
    failure,
    batches,
    health,
    buildSource,
    startSource,
    settle,
    advance,
    readOutcomes: async () => {
      const records = await readRecords(triggers.context.log, {
        afterSequence: 0,
        kinds: ['trigger.fired', 'trigger.skipped'],
      });

      return records.map((entry) => ({ kind: entry.record.kind, payload: entry.record.payload }));
    },
  };
}

test('it fires a slot within 60 seconds as a fire that is not a catch-up', async () => {
  const ctx = await setupTest();

  await ctx.armTaskDefinition({ schedule: { every: { minutes: 5 } } });
  await ctx.startSource();
  await ctx.settle();
  await ctx.advance(5 * 60_000 + 10_000);

  const outcomes = await ctx.readOutcomes();

  expect(outcomes.map((outcome) => [outcome.kind, outcome.payload['isCatchUp']])).toStrictEqual([
    ['trigger.fired', false],
  ]);
});

test('it fires a catch-up within half the interval', async () => {
  const ctx = await setupTest();

  await ctx.armTaskDefinition({ schedule: { every: { minutes: 5 } } });
  await ctx.startSource();
  await ctx.settle();
  await ctx.advance(5 * 60_000 + 90_000);

  const outcomes = await ctx.readOutcomes();

  expect(
    outcomes.map((outcome) => [
      outcome.kind,
      outcome.payload['scheduledFor'],
      outcome.payload['isCatchUp'],
    ]),
  ).toStrictEqual([['trigger.fired', '2027-03-09T00:05:00.000Z', true]]);
});

test('it skips a slot beyond half the interval with too_late', async () => {
  const ctx = await setupTest();

  await ctx.armTaskDefinition({ schedule: { every: { minutes: 5 } } });
  await ctx.startSource();
  await ctx.settle();
  await ctx.advance(5 * 60_000 + 160_000);

  const outcomes = await ctx.readOutcomes();

  expect(outcomes.map((outcome) => [outcome.kind, outcome.payload['reason']])).toStrictEqual([
    ['trigger.skipped', 'too_late'],
  ]);
});

test('it skips a late slot with catch_up_off when catch-up is off', async () => {
  const ctx = await setupTest();

  await ctx.armTaskDefinition({ schedule: { every: { minutes: 5 }, catchUp: 'skip' } });
  await ctx.startSource();
  await ctx.settle();
  await ctx.advance(5 * 60_000 + 90_000);

  const outcomes = await ctx.readOutcomes();

  expect(outcomes.map((outcome) => [outcome.kind, outcome.payload['reason']])).toStrictEqual([
    ['trigger.skipped', 'catch_up_off'],
  ]);
});

test('it fires once after downtime across a daylight-saving change and lists the other local slots as skipped', async () => {
  const ctx = await setupTest();

  await ctx.armTaskDefinition({
    schedule: { every: 'day', at: '08:00', zone: 'Australia/Sydney' },
  });

  await ctx.startSource();
  await ctx.settle();
  await ctx.advance(28 * 86_400_000);

  const outcomes = await ctx.readOutcomes();
  const rows = await readTestTriggerRows(ctx);

  expect(
    outcomes.map((outcome) => [
      outcome.kind,
      outcome.payload['dedupeKey'],
      outcome.payload['scheduledFor'],
      outcome.payload['skippedCount'],
      Array.isArray(outcome.payload['skipped']) ? outcome.payload['skipped'].length : null,
    ]),
  ).toStrictEqual([
    ['trigger.fired', 'water-the-tomatoes|2027-04-06T08:00', '2027-04-05T22:00:00.000Z', 27, 20],
  ]);

  expect(rows.keys.map((row) => row.source_key)).toStrictEqual([
    'schedule\nwater-the-tomatoes|2027-04-06T08:00',
  ]);
});

test('it fires a window with idleMinutes once the conversation goes idle', async () => {
  const ctx = await setupTest();

  await ctx.armTaskDefinition({
    schedule: { every: 'day', window: { from: '09:00', until: '17:00' }, idleMinutes: 30 },
  });

  ctx.lastMessage.at = Date.parse('2027-03-09T09:50:00Z');

  await ctx.startSource();
  await ctx.settle();
  await ctx.advance(10 * 3_600_000);

  const busy = await ctx.readOutcomes();

  await ctx.advance(30 * 60_000);

  const idle = await ctx.readOutcomes();

  expect([busy.length, idle.map((outcome) => outcome.kind)]).toStrictEqual([0, ['trigger.fired']]);
});

test('it skips a window with idleMinutes with window_closed when the conversation never goes idle', async () => {
  const ctx = await setupTest();

  await ctx.armTaskDefinition({
    schedule: { every: 'day', window: { from: '09:00', until: '17:00' }, idleMinutes: 30 },
  });

  ctx.lastMessage.at = Date.parse('2027-03-09T16:59:00Z');

  await ctx.startSource();
  await ctx.settle();
  await ctx.advance(16 * 3_600_000 + 59 * 60_000 + 40_000);

  const open = await ctx.readOutcomes();

  await ctx.advance(60_000);

  const closed = await ctx.readOutcomes();

  expect([
    open.length,
    closed.map((outcome) => [outcome.kind, outcome.payload['reason']]),
  ]).toStrictEqual([0, [['trigger.skipped', 'window_closed']]]);
});

test('it fires a window without idleMinutes at the start of the window', async () => {
  const ctx = await setupTest();

  await ctx.armTaskDefinition({
    schedule: { every: 'day', window: { from: '09:00', until: '17:00' } },
  });

  await ctx.startSource();
  await ctx.settle();
  await ctx.advance(9 * 3_600_000 + 10_000);

  const outcomes = await ctx.readOutcomes();

  expect(
    outcomes.map((outcome) => [
      outcome.kind,
      outcome.payload['scheduledFor'],
      outcome.payload['isCatchUp'],
    ]),
  ).toStrictEqual([['trigger.fired', '2027-03-09T09:00:00.000Z', false]]);
});

test('it builds the event of a taken local slot at each tick, and the core writes nothing', async () => {
  const ctx = await setupTest();

  await ctx.armTaskDefinition({ schedule: { every: 'day', at: '08:00' } });
  await ctx.startSource();
  await ctx.settle();
  await ctx.advance(8 * 3_600_000);

  ctx.owner.zone = 'America/Los_Angeles';

  const before = ctx.batches.length;

  await ctx.advance(8 * 3_600_000 + 10_000);
  await ctx.advance(20_000);

  const outcomes = await ctx.readOutcomes();

  expect(
    ctx.batches.slice(before).map((batch) => batch.events.map((event) => event.dedupeKey)),
  ).toStrictEqual([
    ['water-the-tomatoes|2027-03-09T08:00'],
    ['water-the-tomatoes|2027-03-09T08:00'],
  ]);

  expect(outcomes.map((outcome) => outcome.kind)).toStrictEqual(['trigger.fired']);
});

test('it reports unhealthy after 3 failed ticks in a row and running after the next good tick', async () => {
  const ctx = await setupTest();

  ctx.failure.isOn = true;

  await ctx.startSource();
  await ctx.settle();
  await ctx.advance(20_000);

  const afterTwo = [...ctx.health];

  await ctx.advance(20_000);

  const afterThree = [...ctx.health];

  ctx.failure.isOn = false;

  await ctx.advance(20_000);

  expect([afterTwo, afterThree.at(-1), ctx.health.at(-1)]).toStrictEqual([
    ['running'],
    'unhealthy',
    'running',
  ]);
});

test('it keeps ticking after a failed tick', async () => {
  const ctx = await setupTest();

  await ctx.armTaskDefinition({ schedule: { every: { minutes: 5 } } });

  ctx.failure.isOn = true;

  await ctx.startSource();
  await ctx.settle();

  ctx.failure.isOn = false;

  await ctx.advance(5 * 60_000 + 10_000);

  const outcomes = await ctx.readOutcomes();

  expect(outcomes.map((outcome) => outcome.kind)).toStrictEqual(['trigger.fired']);
});

test('it waits for a tick in flight when it stops', async () => {
  const ctx = await setupTest();

  const gate = Promise.withResolvers<number | null>();
  const reads = { count: 0 };

  const source = await ctx.startSource(
    ctx.buildSource(() => {
      reads.count += 1;

      return gate.promise;
    }),
  );

  await waitForCondition(() => reads.count === 1);

  const stopped = source.stop();

  const early = await Promise.race([stopped.then(() => 'stopped'), Promise.resolve('waiting')]);

  gate.resolve(null);

  await stopped;

  expect([early, ctx.health.at(-1), ctx.clock.countPending()]).toStrictEqual([
    'waiting',
    'stopped',
    0,
  ]);
});

test('it resolves a stop while it sleeps', async () => {
  const ctx = await setupTest();
  const source = await ctx.startSource();

  await ctx.settle();
  await source.stop();

  expect([ctx.health.at(-1), ctx.clock.countPending()]).toStrictEqual(['stopped', 0]);
});

test('it delivers nothing for a tick with no event', async () => {
  const ctx = await setupTest();

  await ctx.armTaskDefinition({ schedule: { every: { minutes: 5 } } });
  await ctx.startSource();
  await ctx.settle();
  await ctx.advance(20_000);

  expect(ctx.batches).toStrictEqual([]);
});

test('it fires a one-shot once across a restart', async () => {
  const ctx = await setupTest();

  await ctx.armTaskDefinition({ at: '2027-03-09T00:10:00.000Z' });

  const first = await ctx.startSource();

  await ctx.settle();
  await ctx.advance(10 * 60_000 + 10_000);
  await first.stop();
  await ctx.startSource(ctx.buildSource());
  await ctx.settle();
  await ctx.advance(20_000);

  const outcomes = await ctx.readOutcomes();

  expect(outcomes.map((outcome) => [outcome.kind, outcome.payload['kind']])).toStrictEqual([
    ['trigger.fired', 'at'],
  ]);
});

test('it fires a one-shot first seeded after its time as a catch-up', async () => {
  const ctx = await setupTest();

  await ctx.armTaskDefinition({ at: '2027-03-08T10:00:00.000Z' });
  await ctx.startSource();
  await ctx.settle();

  const outcomes = await ctx.readOutcomes();

  expect(outcomes.map((outcome) => [outcome.kind, outcome.payload['isCatchUp']])).toStrictEqual([
    ['trigger.fired', true],
  ]);
});

test('it does not fire a fired one-shot that is disabled and enabled again', async () => {
  const ctx = await setupTest();

  await ctx.armTaskDefinition({ at: '2027-03-09T00:10:00.000Z' });
  await ctx.startSource();
  await ctx.settle();
  await ctx.advance(10 * 60_000 + 10_000);

  await seedDefinitionsInForce(ctx, []);

  await seedDefinitionsInForce(ctx, [
    buildTestArmedDefinition({ trigger: triggerSchema.parse({ at: '2027-03-09T00:10:00.000Z' }) }),
  ]);

  await ctx.advance(20_000);

  const outcomes = await ctx.readOutcomes();
  const rows = await readTestTriggerRows(ctx);

  expect([
    outcomes.length,
    ctx.batches.length,
    rows.definitions.map((row) => row.definition_hash),
  ]).toStrictEqual([1, 1, [null]]);
});

test('it builds no event for a one-shot whose at is edited away and back after a fire', async () => {
  const ctx = await setupTest();

  await ctx.armTaskDefinition({ at: '2027-03-09T00:10:00.000Z' });
  await ctx.startSource();
  await ctx.settle();
  await ctx.advance(10 * 60_000 + 10_000);

  await seedDefinitionsInForce(ctx, [
    buildTestArmedDefinition({
      trigger: triggerSchema.parse({ schedule: { every: 'day', at: '23:00' } }),
    }),
  ]);

  await seedDefinitionsInForce(ctx, [
    buildTestArmedDefinition({ trigger: triggerSchema.parse({ at: '2027-03-09T00:10:00.000Z' }) }),
  ]);

  await ctx.advance(2 * 86_400_000);

  const rows = await readTestTriggerRows(ctx);

  expect([ctx.batches.length, rows.definitions.map((row) => row.definition_hash)]).toStrictEqual([
    1,
    [null],
  ]);
});

test('it takes a one-shot out of force when its fire is skipped with still_running', async () => {
  const ctx = await setupTest();

  await ctx.armTaskDefinition({ at: '2027-03-09T00:10:00.000Z' });

  await deliverTriggerBatch(ctx.core, 'schedule', {
    cursor: null,
    events: [
      buildTestTriggerEvent({
        dedupeKey: 'water-the-tomatoes|first',
        scheduledFor: '2027-03-09T00:05:00.000Z',
      }),
    ],
  });

  await ctx.startSource();
  await ctx.settle();
  await ctx.advance(10 * 60_000 + 10_000);

  await seedDefinitionsInForce(ctx, [
    buildTestArmedDefinition({ trigger: triggerSchema.parse({ at: '2027-03-09T00:10:00.000Z' }) }),
  ]);

  await ctx.advance(20_000);

  const outcomes = await ctx.readOutcomes();
  const rows = await readTestTriggerRows(ctx);

  expect([
    outcomes.map((outcome) => [outcome.kind, outcome.payload['reason'] ?? null]),
    ctx.batches.length,
    rows.definitions.map((row) => row.definition_hash),
  ]).toStrictEqual([
    [
      ['trigger.fired', null],
      ['trigger.skipped', 'still_running'],
    ],
    1,
    [null],
  ]);
});

test('it takes a one-shot out of force when its fire is skipped with task_held', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await seedArmedDefinitions(ctx, [
    buildTestArmedDefinition({ trigger: triggerSchema.parse({ at: '2027-03-09T00:10:00.000Z' }) }),
  ]);

  await writeTaskControl(ctx.context, { taskID, control: 'pause' });

  await ctx.startSource();
  await ctx.settle();
  await ctx.advance(10 * 60_000 + 10_000);

  await seedDefinitionsInForce(ctx, [
    buildTestArmedDefinition({ trigger: triggerSchema.parse({ at: '2027-03-09T00:10:00.000Z' }) }),
  ]);

  await ctx.advance(20_000);

  const outcomes = await ctx.readOutcomes();
  const rows = await readTestTriggerRows(ctx);

  expect([
    outcomes.map((outcome) => [outcome.kind, outcome.payload['reason']]),
    rows.definitions.map((row) => row.definition_hash),
  ]).toStrictEqual([[['trigger.skipped', 'task_held']], [null]]);
});

test('it does not fire a one-shot in a restored backup that holds its key', async () => {
  const ctx = await setupTest();

  await ctx.armTaskDefinition({ at: '2027-03-09T00:10:00.000Z' });

  await deliverTriggerBatch(ctx.core, 'schedule', {
    cursor: null,
    events: [
      buildTestTriggerEvent({
        kind: 'at',
        dedupeKey: 'water-the-tomatoes|2027-03-09T00:10:00.000Z',
        scheduledFor: '2027-03-09T00:10:00.000Z',
      }),
    ],
  });

  await seedArmedDefinitions(ctx, [
    buildTestArmedDefinition({ trigger: triggerSchema.parse({ at: '2027-03-09T00:10:00.000Z' }) }),
  ]);

  await ctx.startSource();
  await ctx.settle();
  await ctx.advance(10 * 60_000 + 10_000);

  const outcomes = await ctx.readOutcomes();

  expect([outcomes.map((outcome) => outcome.kind), ctx.batches.length]).toStrictEqual([
    ['trigger.fired'],
    1,
  ]);
});

test('it fires once as a catch-up when nixie resumes within half the interval of a slot that it held', async () => {
  const ctx = await setupTest();

  await ctx.armTaskDefinition({ schedule: { every: { minutes: 5 } } });
  await ctx.pauseNixie();
  await ctx.startSource();
  await ctx.settle();
  await ctx.advance(5 * 60_000 + 20_000);

  const heldOutcomes = await ctx.readOutcomes();

  await ctx.resumeNixie();
  await ctx.advance(80_000);

  const outcomes = await ctx.readOutcomes();

  expect(heldOutcomes).toStrictEqual([]);

  expect(
    outcomes.map((outcome) => [
      outcome.kind,
      outcome.payload['scheduledFor'],
      outcome.payload['isCatchUp'],
    ]),
  ).toStrictEqual([['trigger.fired', '2027-03-09T00:05:00.000Z', true]]);
});

test('it skips with too_late a slot that nixie held past half the interval', async () => {
  const ctx = await setupTest();

  await ctx.armTaskDefinition({ schedule: { every: { minutes: 5 } } });
  await ctx.pauseNixie();
  await ctx.startSource();
  await ctx.settle();
  await ctx.advance(5 * 60_000 + 140_000);
  await ctx.resumeNixie();
  await ctx.advance(20_000);

  const outcomes = await ctx.readOutcomes();

  expect(outcomes.map((outcome) => [outcome.kind, outcome.payload['reason']])).toStrictEqual([
    ['trigger.skipped', 'too_late'],
  ]);
});

test('it keeps a one-shot in force while the spending stop holds it, and fires and retires it when the stop clears', async () => {
  const ctx = await setupTest();

  await ctx.armTaskDefinition({ at: '2027-03-09T00:10:00.000Z' });
  await ctx.seed.spendStop();
  await ctx.startSource();
  await ctx.settle();
  await ctx.advance(10 * 60_000 + 10_000);

  const held = await readTestTriggerRows(ctx);

  await ctx.seed.record({
    kind: 'spend.stop_cleared',
    payload: { reason: 'reset' },
  });

  await ctx.advance(20_000);

  const outcomes = await ctx.readOutcomes();
  const rows = await readTestTriggerRows(ctx);

  expect([
    held.definitions.map((row) => row.definition_hash),
    outcomes.map((outcome) => outcome.kind),
    rows.definitions.map((row) => row.definition_hash),
  ]).toStrictEqual([['hash-1'], ['trigger.fired'], [null]]);
});
