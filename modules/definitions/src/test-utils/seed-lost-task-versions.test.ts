import { expect, test } from 'bun:test';
import { sql } from 'kysely';
import { requestDefinitionChange } from '../runtime-task/request-definition-change';
import { buildTestDefineInput } from './build-test-define-input';
import { seedLostTaskVersions } from './seed-lost-task-versions';
import { startTestDefinitions } from './start-test-definitions';

test('it empties the versions table', async () => {
  const ctx = await startTestDefinitions();

  await ctx.seed();

  await requestDefinitionChange(ctx.context, { kind: 'define', input: buildTestDefineInput() });
  await seedLostTaskVersions(ctx.writer);

  const versions = await sql`select definition_hash from task_definition_versions`.execute(
    ctx.writer.db,
  );

  expect(versions.rows).toStrictEqual([]);
});
