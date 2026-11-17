import { expect, test } from 'bun:test';
import { readQueryRows } from '@heynixie/db';
import { buildTestTaskYaml, startTestDefinitions } from '@heynixie/definitions/test-utils';
import { sql } from 'kysely';
import { z } from 'zod';
import { seedOldTaskHash } from './seed-old-task-hash';

async function setupTest() {
  const ctx = await startTestDefinitions();

  return {
    ...ctx,
    readVersions: () =>
      readQueryRows(
        sql`select definition_hash, form from task_definition_versions`,
        ctx.writer.db,
        z.object({ definition_hash: z.string(), form: z.string() }),
      ),
    readArmedHashes: async () => {
      const rows = await readQueryRows(
        sql`select definition_hash from trigger_definitions`,
        ctx.writer.db,
        z.object({ definition_hash: z.string().nullable() }),
      );

      return rows.map((row) => row.definition_hash);
    },
  };
}

test('it puts a seeded definition back under a hash of a form that names target: task', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('tend-the-garden', buildTestTaskYaml());
  await ctx.seed();

  const hash = await seedOldTaskHash(ctx.writer, 'tend-the-garden');
  const versions = await ctx.readVersions();
  const armed = await ctx.readArmedHashes();

  expect(versions).toStrictEqual([
    { definition_hash: hash, form: expect.stringContaining('"target":"task"') },
  ]);

  expect(armed).toStrictEqual([hash]);
});
