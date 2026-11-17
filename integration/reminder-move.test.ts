import { expect, test } from 'bun:test';
import { nixieSchema, readQueryRows } from '@heynixie/db';
import { readListedDefinitions, writeReminderMoveSettle } from '@heynixie/definitions';
import {
  buildTestTaskYaml,
  readTestRuntimeTasks,
  startTestDefinitions,
} from '@heynixie/definitions/test-utils';
import { runProjectionRebuild, withWriteTransaction } from '@heynixie/log';
import { readArmedReminders, remindersProjections, runReminderMoves } from '@heynixie/reminders';
import { createConversationTask } from '@heynixie/tasks';
import { deliverTriggerBatch } from '@heynixie/triggers';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { seedConversationDefinition } from './test-utils/seed-conversation-definition';
import { seedOldTaskHash } from './test-utils/seed-old-task-hash';

async function setupTest() {
  const ctx = await startTestDefinitions({
    projections: remindersProjections,
    readExtraArmed: readArmedReminders,
  });

  const migration = nixieSchema.migrations.find((candidate) =>
    candidate.name.startsWith('replace the conversation-target definitions'),
  );

  invariant(migration);

  return {
    ...ctx,
    runMigration: () => withWriteTransaction(ctx.writer, (tx) => migration.up(tx)),
    runMoves: () =>
      runReminderMoves({ log: ctx.log, definitions: ctx.tasks.definitions }, async (tx, move) => {
        if (move.changeID !== null) {
          await writeReminderMoveSettle(tx, ctx.tasks, {
            changeID: move.changeID,
            definitionID: move.definitionID,
          });
        }
      }),
    readReminders: async () => {
      const rows = await sql`select r.state, r.origin, r.trigger, v.name, v.note
        from reminders r join reminder_versions v on v.reminder_hash = r.reminder_hash
        order by v.name`.execute(ctx.writer.db);

      return rows.rows;
    },
    readStored: async () => {
      const reminders = await sql`select * from reminders order by set_sequence`.execute(
        ctx.writer.db,
      );

      const armed = await readQueryRows(
        sql`select definition_id, definition_hash, target, trigger
          from trigger_definitions order by definition_id`,
        ctx.writer.db,
        z.object({
          definition_id: z.string(),
          definition_hash: z.string().nullable(),
          target: z.string(),
          trigger: z.string(),
        }),
      );

      return { reminders: reminders.rows, armed };
    },
    readWatermarks: async () => {
      const rows = await readQueryRows(
        sql`select definition_id, after from trigger_definitions order by definition_id`,
        ctx.writer.db,
        z.object({ definition_id: z.string(), after: z.number() }),
      );

      return rows.map((row) => [row.definition_id.split(':')[0], row.after]);
    },
    readLastSequence: async () => {
      const rows = await readQueryRows(
        sql`select max(sequence) as last from records`,
        ctx.writer.db,
        z.object({ last: z.number() }),
      );

      return rows[0]?.last ?? 0;
    },
  };
}

test('it turns the conversation definitions into two active reminders, and moves each runtime change out of force', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('tend-the-garden', buildTestTaskYaml());
  await ctx.seed();

  const weekly = {
    schedule: {
      every: 'week',
      on: 'fri',
      at: '08:00',
      zone: 'owner',
      catchUp: 'once',
    },
  } as const;

  const once = { at: '2027-03-09T14:00:00+11:00' } as const;

  await seedConversationDefinition(ctx, {
    definitionID: 'water-the-tomatoes',
    hash: 'a'.repeat(64),
    name: 'Tomatoes',
    note: 'Water the tomatoes.',
    trigger: weekly,
    changeID: null,
  });

  await seedConversationDefinition(ctx, {
    definitionID: 'call-the-dentist',
    hash: 'b'.repeat(64),
    name: 'Dentist',
    note: 'Call the dentist.',
    trigger: once,
    changeID: 'c1',
  });

  await seedOldTaskHash(ctx.writer, 'tend-the-garden');

  await ctx.runMigration();

  const moved = await ctx.runMoves();
  const reminders = await ctx.readReminders();
  const runtime = await readTestRuntimeTasks(ctx.writer);
  const stored = await ctx.readStored();
  const listed = await readListedDefinitions(ctx.writer.db);

  await runProjectionRebuild(ctx.log);

  const rebuilt = await ctx.readStored();

  expect(moved).toBe(2);

  expect(reminders).toStrictEqual([
    {
      state: 'active',
      origin: 'migration',
      name: 'Dentist',
      note: 'Call the dentist.',
      trigger: '{"at":"2027-03-09T14:00:00+11:00"}',
    },
    {
      state: 'active',
      origin: 'migration',
      name: 'Tomatoes',
      note: 'Water the tomatoes.',
      trigger: expect.stringContaining('"every":"week"'),
    },
  ]);

  expect(runtime.map((change) => [change.change_id, change.state])).toStrictEqual([
    ['c1', 'retired'],
  ]);

  expect(listed.map((definition) => definition.definitionID)).toStrictEqual(['tend-the-garden']);
  expect(rebuilt).toStrictEqual(stored);
});

test('it writes nothing on a second run of the moves and a seed of the repo files', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('tend-the-garden', buildTestTaskYaml());
  await ctx.seed();

  await seedConversationDefinition(ctx, {
    definitionID: 'water-the-tomatoes',
    hash: 'a'.repeat(64),
    name: 'Tomatoes',
    note: 'Water the tomatoes.',
    trigger: { at: '2027-03-09T14:00:00+11:00' },
    changeID: null,
  });

  await seedOldTaskHash(ctx.writer, 'tend-the-garden');

  await ctx.runMigration();
  await ctx.runMoves();

  const before = await ctx.readLastSequence();
  const again = await ctx.runMoves();
  const seeded = await ctx.seed();
  const after = await ctx.readLastSequence();

  expect(again).toBe(0);
  expect(seeded.status).not.toBe('refused');
  expect(after).toBe(before);
});

test('it fires a moved reminder once per slot while the repo file still names the conversation target', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask(
    'water-the-tomatoes',
    'name: Tomatoes\nbrief: Water the tomatoes.\ntarget: conversation\ntrigger:\n  at: "2027-03-09T14:00:00+11:00"\n',
  );

  await seedConversationDefinition(ctx, {
    definitionID: 'water-the-tomatoes',
    hash: 'a'.repeat(64),
    name: 'Tomatoes',
    note: 'Water the tomatoes.',
    trigger: { at: '2027-03-09T14:00:00+11:00' },
    changeID: null,
  });

  await createConversationTask(ctx.tasks);

  await ctx.runMigration();
  await ctx.runMoves();
  await ctx.seed();

  const stored = await ctx.readStored();

  const armed = stored.armed.find((row) => row.definition_id.startsWith('reminder:'));

  invariant(armed);

  const fire = {
    cursor: null,
    events: [
      {
        definitionID: armed.definition_id,
        definitionHash: armed.definition_hash ?? '',
        kind: 'at' as const,
        dedupeKey: 'slot-1',
        scheduledFor: '2027-03-09T03:00:00.000Z',
        occurredAt: '2027-03-09T03:00:00.000Z',
        missed: [],
        missedCount: 0,
        payload: null,
      },
    ],
  };

  await deliverTriggerBatch(ctx.core, 'schedule', fire);
  await deliverTriggerBatch(ctx.core, 'schedule', fire);

  const fires = await sql`select sequence from records
    where kind = 'trigger.fired'`.execute(ctx.writer.db);

  expect(fires.rows).toHaveLength(1);

  expect(stored.armed).toContainEqual(
    expect.objectContaining({
      definition_id: 'water-the-tomatoes',
      definition_hash: null,
    }),
  );
});

test('it gives a moved recurring reminder the watermark of its old trigger, so a slot that fell due before the move still fires', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('tend-the-garden', buildTestTaskYaml());
  await ctx.seed();

  await seedConversationDefinition(ctx, {
    definitionID: 'water-the-tomatoes',
    hash: 'a'.repeat(64),
    name: 'Tomatoes',
    note: 'Water the tomatoes.',
    trigger: {
      schedule: {
        every: 'week',
        on: 'fri',
        at: '08:00',
        zone: 'owner',
        catchUp: 'once',
      },
    },
    changeID: null,
  });

  const before = await ctx.readWatermarks();

  const [, oldAfter] = before.find(([id]) => id === 'water-the-tomatoes') ?? [];

  await seedOldTaskHash(ctx.writer, 'tend-the-garden');

  await ctx.runMigration();

  ctx.clock.advance(3_600_000);

  await ctx.runMoves();

  const watermarks = await ctx.readWatermarks();

  await runProjectionRebuild(ctx.log);

  const rebuilt = await ctx.readWatermarks();

  expect(watermarks).toContainEqual(['reminder', oldAfter]);
  expect(rebuilt).toStrictEqual(watermarks);
});
