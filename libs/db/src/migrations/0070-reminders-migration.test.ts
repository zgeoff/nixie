import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { z } from 'zod';
import { runMigrations } from '../migration/run-migrations';
import { readQueryRows } from '../read-query-rows';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { remindersMigration } from './0070-reminders-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-reminders-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return {
    db,
    convHash: 'c'.repeat(64),
    taskHash: 'd'.repeat(64),
    conversationForm: {
      name: 'Water the tomatoes',
      brief: 'Water the tomatoes.',
      target: 'conversation',
      enabled: true,
      trigger: { at: '2027-01-01T00:00:00Z' },
    },
    writeVersion: async (hash: string, id: string, form: object, files: object = {}) => {
      await sql`insert into task_definition_versions (definition_hash, definition_id, form, files)
        values (${hash}, ${id}, ${JSON.stringify(form)}, ${JSON.stringify(files)})`.execute(db);
    },
    writeArmed: async (id: string, hash: string | null, target: string) => {
      await sql`insert into trigger_definitions
        (definition_id, source_id, definition_hash, target, trigger, after, updated_sequence)
        values (${id}, 'schedule', ${hash}, ${target}, '{"at":"2027-01-01T00:00:00Z"}', 0, 1)`.execute(
        db,
      );
    },
    writeRuntimeChange: async (changeID: string, id: string, hash: string, state: string) => {
      await sql`insert into runtime_task_definitions
        (change_id, short_id, definition_id, operation, definition_hash, caller, state,
         changed_sequence, updated_sequence)
        values (${changeID}, ${`s-${changeID}`}, ${id}, 'add', ${hash}, 'conversation', ${state}, 1, 1)`.execute(
        db,
      );
    },
    runMigration: () => db.transaction().execute((tx) => remindersMigration.up(tx)),
    readMoves: () =>
      readQueryRows(
        sql`select definition_id, name, note, trigger, source, change_id from reminder_moves
          order by definition_id`,
        db,
        z.object({
          definition_id: z.string(),
          name: z.string(),
          note: z.string(),
          trigger: z.string(),
          source: z.string(),
          change_id: z.string().nullable(),
        }),
      ),
    readReminderVersions: () =>
      readQueryRows(
        sql`select reminder_hash, name, note, trigger from reminder_versions order by reminder_hash`,
        db,
        z.object({
          reminder_hash: z.string(),
          name: z.string(),
          note: z.string(),
          trigger: z.string(),
        }),
      ),
    readTaskVersionHashes: async () => {
      const rows = await readQueryRows(
        sql`select definition_hash from task_definition_versions order by definition_hash`,
        db,
        z.object({ definition_hash: z.string() }),
      );

      return rows.map((row) => row.definition_hash);
    },
  };
}

test('it moves the schema to version 70, which the release before cannot read', () => {
  expect(nixieSchema.migrations.indexOf(remindersMigration) + 1).toBe(70);
  expect(nixieSchema.oldestReader).toBeGreaterThanOrEqual(70);
});

test('it keeps the version of a conversation definition as a reminder version and removes it from the definitions', async () => {
  const ctx = await setupTest();

  await ctx.writeVersion(ctx.convHash, 'water-the-tomatoes', ctx.conversationForm);
  await ctx.runMigration();

  const versions = await ctx.readReminderVersions();
  const hashes = await ctx.readTaskVersionHashes();

  expect(versions).toStrictEqual([
    {
      reminder_hash: ctx.convHash,
      name: 'Water the tomatoes',
      note: 'Water the tomatoes.',
      trigger: '{"at":"2027-01-01T00:00:00Z"}',
    },
  ]);

  expect(hashes).toStrictEqual([]);
});

test('it stages a repo move for an armed conversation definition with no runtime change', async () => {
  const ctx = await setupTest();

  await ctx.writeVersion(ctx.convHash, 'water-the-tomatoes', ctx.conversationForm);
  await ctx.writeArmed('water-the-tomatoes', ctx.convHash, 'conversation');
  await ctx.runMigration();

  const moves = await ctx.readMoves();

  expect(moves).toStrictEqual([
    {
      definition_id: 'water-the-tomatoes',
      name: 'Water the tomatoes',
      note: 'Water the tomatoes.',
      trigger: '{"at":"2027-01-01T00:00:00Z"}',
      source: 'repo',
      change_id: null,
    },
  ]);
});

test('it stages a runtime move with the change that holds the definition in force', async () => {
  const ctx = await setupTest();

  await ctx.writeVersion(ctx.convHash, 'water-the-tomatoes', ctx.conversationForm);
  await ctx.writeArmed('water-the-tomatoes', ctx.convHash, 'conversation');
  await ctx.writeRuntimeChange('change-1', 'water-the-tomatoes', ctx.convHash, 'in_force');
  await ctx.runMigration();

  const [move] = await ctx.readMoves();

  expect(move).toMatchObject({ source: 'runtime', change_id: 'change-1' });
});

test('it stages no move for a withdrawn or a task-target definition', async () => {
  const ctx = await setupTest();

  await ctx.writeVersion(ctx.convHash, 'water-the-tomatoes', ctx.conversationForm);
  await ctx.writeArmed('water-the-tomatoes', null, 'conversation');
  await ctx.writeArmed('feed-the-cat', ctx.taskHash, 'task');
  await ctx.runMigration();

  const moves = await ctx.readMoves();

  expect(moves).toStrictEqual([]);
});

test('it removes a conversation definition from a seed record and a snapshot form', async () => {
  const ctx = await setupTest();

  await ctx.writeVersion(ctx.convHash, 'water-the-tomatoes', ctx.conversationForm);
  await ctx.writeVersion(ctx.taskHash, 'feed-the-cat', { name: 'Feed', target: 'task' });

  await sql`insert into personas (persona_version, instructions) values ('p1', 'persona')`.execute(
    ctx.db,
  );

  await sql`insert into definition_snapshots
    (snapshot_hash, persona_version, policy_hash, form, label, created_at)
    values ('snap', 'p1', 'policy', ${JSON.stringify({
      tasks: [
        { hash: ctx.convHash, id: 'water-the-tomatoes', origin: 'definitions' },
        { hash: ctx.taskHash, id: 'feed-the-cat', origin: 'definitions' },
      ],
    })}, 'label', 1)`.execute(ctx.db);

  await sql`insert into records (recorded_at, kind, snapshot_hash, payload)
    values (1, 'definitions_seeded', 'snap', ${JSON.stringify({
      repoTasks: [
        { id: 'water-the-tomatoes', hash: ctx.convHash },
        { id: 'feed-the-cat', hash: ctx.taskHash },
      ],
    })})`.execute(ctx.db);

  await ctx.runMigration();

  const records = await readQueryRows(
    sql`select payload from records where kind = 'definitions_seeded'`,
    ctx.db,
    z.object({ payload: z.string() }),
  );

  const snapshots = await readQueryRows(
    sql`select form from definition_snapshots where snapshot_hash = 'snap'`,
    ctx.db,
    z.object({ form: z.string() }),
  );

  const [newHash] = await ctx.readTaskVersionHashes();

  expect(newHash).not.toBe(ctx.taskHash);

  expect(records.map((row) => z.unknown().parse(JSON.parse(row.payload)))).toStrictEqual([
    { repoTasks: [{ id: 'feed-the-cat', hash: newHash }] },
  ]);

  expect(snapshots.map((row) => z.unknown().parse(JSON.parse(row.form)))).toStrictEqual([
    { tasks: [{ hash: newHash, id: 'feed-the-cat', origin: 'definitions' }] },
  ]);
});

test('it leaves no stored form or text of a definition with a target key', async () => {
  const ctx = await setupTest();

  await ctx.writeVersion(
    ctx.taskHash,
    'feed-the-cat',
    { name: 'Feed', brief: 'Feed the cat.', target: 'task' },
    {
      'tasks/feed-the-cat/task.yaml': JSON.stringify({ name: 'Feed', target: 'task', brief: 'x' }),
    },
  );

  await ctx.runMigration();

  const rows = await readQueryRows(
    sql`select form, files from task_definition_versions`,
    ctx.db,
    z.object({ form: z.string(), files: z.string() }),
  );

  expect(rows).toStrictEqual([
    {
      form: '{"brief":"Feed the cat.","name":"Feed"}',
      files: String.raw`{"tasks/feed-the-cat/task.yaml":"{\"name\":\"Feed\",\"brief\":\"x\"}"}`,
    },
  ]);
});

test('it runs twice with the same outcome', async () => {
  const ctx = await setupTest();

  await ctx.writeVersion(ctx.convHash, 'water-the-tomatoes', ctx.conversationForm);
  await ctx.writeVersion(ctx.taskHash, 'feed-the-cat', { name: 'Feed', target: 'task' });
  await ctx.runMigration();

  const first = await ctx.readTaskVersionHashes();

  await ctx.runMigration();

  const second = await ctx.readTaskVersionHashes();

  expect(second).toStrictEqual(first);
});

test('it repoints every column, record and projection row that names an old hash', async () => {
  const ctx = await setupTest();

  const oldHash = 'a'.repeat(64);
  const otherOldHash = 'b'.repeat(64);
  const instructions = 'Feed the cat\r\nwell.\n\n';

  await ctx.writeVersion(
    oldHash,
    'feed-the-cat',
    { name: 'Feed', brief: 'Feed the cat.', target: 'task', enabled: true },
    { 'tasks/feed-the-cat/instructions.md': instructions },
  );

  await sql`insert into personas (persona_version, instructions) values ('p1', 'persona')`.execute(
    ctx.db,
  );

  await sql`insert into definition_snapshots
    (snapshot_hash, persona_version, policy_hash, form, label, created_at)
    values ('snap', 'p1', 'policy', ${JSON.stringify({
      tasks: [{ hash: oldHash, id: 'feed-the-cat', origin: 'definitions' }],
    })}, 'label', 1)`.execute(ctx.db);

  await sql`insert into runtime_task_definitions
    (change_id, short_id, definition_id, operation, definition_hash, previous_hash, base_hash,
     definitions_hash, caller, state, changed_sequence, updated_sequence)
    values ('c1', 's1', 'feed-the-cat', 'change', ${oldHash}, ${otherOldHash}, ${oldHash},
      ${oldHash}, 'owner', 'in_force', 1, 1)`.execute(ctx.db);

  await ctx.writeArmed('feed-the-cat', oldHash, 'task');

  for (const kind of [
    'task.definition_set',
    'task.run_opened',
    'trigger.fired',
    'trigger.armed',
    'definition.changed',
    'definition.settled',
  ]) {
    await sql`insert into records (recorded_at, kind, snapshot_hash, payload)
      values (1, ${kind}, 'snap', ${JSON.stringify({ hash: oldHash, definitionHash: oldHash, note: `quotes ${oldHash}` })})`.execute(
      ctx.db,
    );
  }

  await sql`insert into tasks (task_id, is_conversation, state, read_cursor, last_inbox_sequence,
    committed_steps, step_errors, claimable_at, created_sequence, updated_sequence, step_hop,
    pause_requested, definition_id, definition_hash)
    values ('t1', 0, 'ready', 0, 0, 0, 0, 0, 1, 1, 0, 0, 'feed-the-cat', ${oldHash})`.execute(
    ctx.db,
  );

  await sql`insert into projection_changes (sequence, projection, row_key, row)
    values (1, 'tasks', 't1', ${JSON.stringify({ definition_hash: oldHash })})`.execute(ctx.db);

  await ctx.runMigration();

  const sha = new Bun.CryptoHasher('sha256');

  sha.update('Feed the cat\nwell.\n');

  const parts = `{"form":{"brief":"Feed the cat.","enabled":true,"name":"Feed"},"id":"feed-the-cat","instructions":"${sha.digest('hex')}","step":null}`;

  const expected = new Bun.CryptoHasher('sha256').update(parts).digest('hex');

  const tables = await Promise.all([
    sql`select definition_hash from task_definition_versions`.execute(ctx.db),
    sql`select definition_hash from tasks`.execute(ctx.db),
    sql`select definition_hash, previous_hash, base_hash, definitions_hash from runtime_task_definitions`.execute(
      ctx.db,
    ),
    sql`select definition_hash from trigger_definitions`.execute(ctx.db),
    sql`select payload from records where kind != 'definitions_seeded'`.execute(ctx.db),
    sql`select row from projection_changes`.execute(ctx.db),
    sql`select form from definition_snapshots`.execute(ctx.db),
  ]);

  const everything = JSON.stringify(tables.map((table) => table.rows));
  const withoutQuotes = everything.replaceAll(`quotes ${oldHash}`, '');

  const snapshots = await sql`select snapshot_hash from definition_snapshots`.execute(ctx.db);

  expect(withoutQuotes.includes(oldHash)).toBeFalse();
  expect(withoutQuotes.split(expected)).toHaveLength(21);
  expect(everything.includes(`quotes ${oldHash}`)).toBeTrue();
  expect(snapshots.rows).toStrictEqual([{ snapshot_hash: 'snap' }]);
});
