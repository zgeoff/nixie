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
import { memoryWriterRemovalMigration } from './0054-memory-writer-removal-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-memory-writer-removal-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(memoryWriterRemovalMigration),
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  return {
    db,
    runMigration: () => runMigrations(db, { schema: nixieSchema, copyDir: directory }),
    writeSnapshot: async (hash: string, form: object) => {
      await sql`insert into personas (persona_version, instructions) values ('p1', 'Persona.') on conflict do nothing`.execute(
        db,
      );

      await sql`insert into definition_snapshots (snapshot_hash, persona_version, policy_hash, form, label, created_at)
        values (${hash}, 'p1', 'h1', ${JSON.stringify(form)}, 'rev', 1)`.execute(db);
    },
    readForm: async (hash: string): Promise<unknown> => {
      const rows = await readQueryRows(
        sql`select form from definition_snapshots where snapshot_hash = ${hash}`,
        db,
        z.object({ form: z.string() }),
      );

      const form: unknown = JSON.parse(rows[0]?.form ?? 'null');

      return form;
    },
  };
}

test('it removes the instruction override of the session prompt and keeps its other parts', async () => {
  const ctx = await setupTest();

  await ctx.writeSnapshot('s1', {
    prompts: {
      session: { parts: { instruction: 'Be brief.', safety: 'Stay safe.' }, template: null },
      task: { parts: { intro: 'Hello.' }, template: null },
    },
  });

  await ctx.runMigration();

  const form = await ctx.readForm('s1');

  expect(form).toStrictEqual({
    prompts: {
      session: { parts: { safety: 'Stay safe.' }, template: null },
      task: { parts: { intro: 'Hello.' }, template: null },
    },
  });
});

test('it clears a session template that names the instruction part', async () => {
  const ctx = await setupTest();

  await ctx.writeSnapshot('s1', {
    prompts: {
      session: {
        parts: { safety: 'Stay safe.' },
        template: '{{ persona }}{{ parts.instruction }}{{ parts.safety }}',
      },
    },
  });

  await ctx.runMigration();

  const form = await ctx.readForm('s1');

  expect(form).toStrictEqual({
    prompts: { session: { parts: { safety: 'Stay safe.' }, template: null } },
  });
});

test('it removes the session override that only held the instruction', async () => {
  const ctx = await setupTest();

  await ctx.writeSnapshot('s1', {
    persona: 'p1',
    prompts: { session: { parts: { instruction: 'Be brief.' }, template: null } },
  });

  await ctx.runMigration();

  const form = await ctx.readForm('s1');

  expect(form).toStrictEqual({ persona: 'p1' });
});

test('it removes the instruction part of an approved session override', async () => {
  const ctx = await setupTest();

  await sql`insert into prompt_approvals (approval_id, proposal_id, prompt_id, thread, entry, files, state, approved_at, updated_at)
    values ('a1', 'p1', 'session', null,
      ${JSON.stringify({ instruction: 'prompts/instruction.md', safety: 'prompts/safety.md' })},
      ${JSON.stringify([
        { path: 'prompts/instruction.md', text: 'Be brief.' },
        { path: 'prompts/safety.md', text: 'Stay safe.' },
      ])},
      'current', 1, 1)`.execute(ctx.db);

  await ctx.runMigration();

  const rows = await sql`select entry, files from prompt_approvals`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([
    {
      entry: JSON.stringify({ safety: 'prompts/safety.md' }),
      files: JSON.stringify([{ path: 'prompts/safety.md', text: 'Stay safe.' }]),
    },
  ]);
});
