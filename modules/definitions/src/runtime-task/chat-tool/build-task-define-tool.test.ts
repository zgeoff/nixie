import { expect, test } from 'bun:test';
import { parseJSONObject } from '@heynixie/log';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import { sql } from 'kysely';
import { z } from 'zod';
import { buildTestDefineInput } from '../../test-utils/build-test-define-input';
import { buildTestTaskYaml } from '../../test-utils/build-test-task-yaml';
import { readTestRuntimeTasks } from '../../test-utils/read-test-runtime-tasks';
import { startTestDefinitions } from '../../test-utils/start-test-definitions';
import { readDefinitionForms } from '../read-definition-forms';
import { buildTaskDefineTool } from './build-task-define-tool';

async function setupTest() {
  const ctx = await startTestDefinitions();

  const tool = buildTaskDefineTool({
    readDefinitions: () => ctx.context,
    readZone: () => Promise.resolve('Europe/Paris'),
  });

  return {
    ...ctx,
    tool,
    define: (input: object) => {
      const call = buildMockToolCall({
        tool: 'task.define',
        input: parseJSONObject(JSON.stringify(input)),
      });

      return tool.run(call, buildMockToolContext());
    },
    readHashes: async () => {
      const rows = await readTestRuntimeTasks(ctx.writer);

      return rows.flatMap((row) => (row.definition_hash === null ? [] : [row.definition_hash]));
    },
  };
}

test('it declares the schedule effect and runs direct', async () => {
  const ctx = await setupTest();

  expect([ctx.tool.declaration.effects, ctx.tool.execution]).toStrictEqual([
    ['schedule'],
    'direct',
  ]);
});

test('it defines a task and returns its ID, words, next fire and short change ID', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  const outcome = await ctx.define(buildTestDefineInput({}));

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      definitionID: 'water-the-tomatoes',
      rendered: 'every Friday at 08:00',
      next: expect.any(String),
      changeID: expect.any(String),
    },
  });
});

test('it stores an at without an offset with the offset of the owner zone', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  await ctx.define(
    buildTestDefineInput({
      name: 'Book the dentist',
      brief: 'Book the dentist.',
      target: 'task',
      trigger: { at: '2027-03-12T08:00' },
    }),
  );

  const hashes = await ctx.readHashes();
  const forms = await readDefinitionForms(ctx.writer.db, hashes);

  expect([...forms.values()].map((form) => form.trigger)).toStrictEqual([
    { at: '2027-03-12T08:00:00+01:00' },
  ]);
});

test('it returns ID_TAKEN for an ID that the repo holds', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml());
  await ctx.seed();

  const outcome = await ctx.define(buildTestDefineInput({ brief: 'Water them well.' }));

  expect(outcome).toStrictEqual({ status: 'ok', result: { refused: { code: 'ID_TAKEN' } } });
});

test('it returns NOT_FOUND for a replacement of a definition that does not exist', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  const outcome = await ctx.define(buildTestDefineInput({ definitionID: 'feed-the-cat' }));

  expect(outcome).toStrictEqual({ status: 'ok', result: { refused: { code: 'NOT_FOUND' } } });
});

test('it returns UNCHANGED for a replacement that holds the version in force', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml());
  await ctx.seed();

  const outcome = await ctx.define(buildTestDefineInput({ definitionID: 'water-the-tomatoes' }));

  expect(outcome).toStrictEqual({ status: 'ok', result: { refused: { code: 'UNCHANGED' } } });
});

test('it returns FILE_ONLY_KEYS for a replacement of a definition that holds an instructions file', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml({ target: 'task' }), {
    'instructions.md': 'Water the tomatoes at the roots.\n',
  });

  await ctx.seed();

  const outcome = await ctx.define(
    buildTestDefineInput({ definitionID: 'water-the-tomatoes', brief: 'Water them well.' }),
  );

  expect(outcome).toStrictEqual({ status: 'ok', result: { refused: { code: 'FILE_ONLY_KEYS' } } });
});

test('it returns ONE_SHOT_OVER_REPO for a one-shot over a definition that the repo holds', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml());
  await ctx.seed();

  const outcome = await ctx.define({
    ...buildTestDefineInput({ definitionID: 'water-the-tomatoes' }),
    trigger: { at: '2027-03-12T08:00:00+01:00' },
  });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { refused: { code: 'ONE_SHOT_OVER_REPO' } },
  });
});

test('it returns INVALID with the reasons for a version that a start refuses', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  const outcome = await ctx.define(
    buildTestDefineInput({ target: 'task', tools: ['files.write'] }),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { refused: { code: 'INVALID', reasons: expect.any(Array) } },
  });
});

test('it names the task-only fields that a conversation target takes none of', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  const outcome = await ctx.define(buildTestDefineInput({ memory: 'none', report: 'none' }));

  expect(outcome).toStrictEqual({
    status: 'error',
    message:
      'A conversation target takes only name, brief, target, trigger and definitionID. ' +
      'Leave out: memory, report.',
  });
});

test('it returns INVALID for a name with an empty slug', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  const outcome = await ctx.define(buildTestDefineInput({ name: '!!!' }));

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { refused: { code: 'INVALID', reasons: expect.any(Array) } },
  });
});

test('it resets the model to the default when a change omits it', async () => {
  const ctx = await setupTest();

  await ctx.seed();
  await ctx.define(buildTestDefineInput({ target: 'task', model: 'second-look' }));

  await ctx.define(
    buildTestDefineInput({
      definitionID: 'water-the-tomatoes',
      brief: 'Water them well.',
      target: 'task',
    }),
  );

  const hashes = await ctx.readHashes();

  const latest = hashes.at(-1);

  const stored =
    await sql`select form from task_definition_versions where definition_hash = ${latest}`.execute(
      ctx.writer.db,
    );

  const forms = stored.rows.map((row) => z.object({ form: z.string() }).parse(row).form);

  expect(forms.map((form): unknown => JSON.parse(form))).not.toContainEqual(
    expect.objectContaining({ model: expect.anything() }),
  );
});

test('it returns an error for an input that breaks the schema', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  const outcome = await ctx.define({ name: 'Water the tomatoes' });

  expect(outcome.status).toBe('error');
});
