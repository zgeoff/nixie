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
import { taskYAMLTextMigration } from './0070-task-yaml-text-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-task-yaml-text-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return {
    writeVersion: async (hash: string, form: string, files: Record<string, string>) => {
      await sql`insert into task_definition_versions (definition_hash, definition_id, form, files)
        values (${hash}, 'water-plants', ${form}, ${JSON.stringify(files)})`.execute(db);
    },
    runMigration: () => db.transaction().execute((tx) => taskYAMLTextMigration.up(tx)),
    readVersions: () =>
      readQueryRows(
        sql`select definition_hash, form, files from task_definition_versions
          order by definition_hash`,
        db,
        z.object({ definition_hash: z.string(), form: z.string(), files: z.string() }),
      ),
  };
}

test('it is the migration of version 70, the oldest reader', () => {
  expect(nixieSchema.migrations.indexOf(taskYAMLTextMigration) + 1).toBe(70);
  expect(nixieSchema.oldestReader).toBeGreaterThanOrEqual(70);
});

test('it rewrites one-line JSON task.yaml text as block YAML and leaves the rest alone', async () => {
  const ctx = await setupTest();

  const mapping = { name: 'Water: the plants', brief: 'Water them.', target: 'conversation' };
  const handWritten = '# kept as written\nname: Mow the lawn\nbrief: Mow it.\n';

  await ctx.writeVersion('hash-a', '{"form":1}', {
    'tasks/water-plants/task.yaml': JSON.stringify(mapping),
    'tasks/water-plants/instructions.md': '{"not":"yaml"}',
  });

  await ctx.writeVersion('hash-b', '{"form":2}', { 'tasks/water-plants/task.yaml': handWritten });
  await ctx.runMigration();

  const rows = await ctx.readVersions();

  expect(rows).toStrictEqual([
    {
      definition_hash: 'hash-a',
      form: '{"form":1}',
      files: JSON.stringify({
        'tasks/water-plants/task.yaml':
          'name: "Water: the plants"\nbrief: Water them.\ntarget: conversation\n',
        'tasks/water-plants/instructions.md': '{"not":"yaml"}',
      }),
    },
    {
      definition_hash: 'hash-b',
      form: '{"form":2}',
      files: JSON.stringify({ 'tasks/water-plants/task.yaml': handWritten }),
    },
  ]);
});

test('it keeps the parsed mapping of a rewritten file', async () => {
  const ctx = await setupTest();

  const mapping = { name: 'Check', brief: 'Line one\nline two # not a comment', tools: [] };

  await ctx.writeVersion('hash-a', '{}', {
    'tasks/water-plants/task.yaml': JSON.stringify(mapping),
  });

  await ctx.runMigration();

  const [row] = await ctx.readVersions();

  const text = z.record(z.string(), z.string()).parse(JSON.parse(row?.files ?? '{}'))[
    'tasks/water-plants/task.yaml'
  ];

  expect(Bun.YAML.parse(text ?? '')).toStrictEqual(mapping);
});

test('it changes nothing on a second run', async () => {
  const ctx = await setupTest();

  await ctx.writeVersion('hash-a', '{}', {
    'tasks/water-plants/task.yaml': '{"name":"Check","brief":"Look."}',
  });

  await ctx.runMigration();

  const first = await ctx.readVersions();

  await ctx.runMigration();

  const second = await ctx.readVersions();

  expect(second).toStrictEqual(first);
});
