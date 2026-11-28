import { expect, mock, test } from 'bun:test';
import { parseJSONObject } from '@heynixie/log';
import type { RelatedMemoryLookup } from '@heynixie/tools';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { readDefinitionVersion } from '../../task/read-definition-version';
import { buildTestDefineInput } from '../../test-utils/build-test-define-input';
import { buildTestTaskYaml } from '../../test-utils/build-test-task-yaml';
import { readTestRuntimeTasks } from '../../test-utils/read-test-runtime-tasks';
import { startTestDefinitions } from '../../test-utils/start-test-definitions';
import { readDefinitionForms } from '../read-definition-forms';
import { buildTaskDefineTool } from './build-task-define-tool';

async function setupTest() {
  const ctx = await startTestDefinitions();

  const usable: { now: Record<string, string[]> } = { now: { 'time.now': ['k3x9m2p7qa'] } };

  const tool = buildTaskDefineTool({
    readDefinitions: () => ctx.context,
    readZone: () => Promise.resolve('Europe/Paris'),
    connections: {
      readUsable: () => Promise.resolve(usable.now),
    },
  });

  return {
    ...ctx,
    usable,
    tool,
    resolve: (input: object) =>
      tool.resolveInput?.(parseJSONObject(JSON.stringify(input)), {
        run: buildMockToolContext().run,
      }),
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
      rendered: 'every Friday at 08:00 (Europe/Paris)',
      next: expect.any(String),
      changeID: expect.any(String),
    },
  });
});

test('it adds the matching memory to the result of a define as related, from the name and the brief', async () => {
  const ctx = await setupTest();

  const read = mock<(text: string) => Promise<{ shortID: string; text: string }[]>>(() =>
    Promise.resolve([{ shortID: 'k3m9q2xzab', text: 'The tomatoes are in the greenhouse' }]),
  );

  const tool = buildTaskDefineTool({
    readDefinitions: () => ctx.context,
    readZone: () => Promise.resolve('Europe/Paris'),
    relatedMemory: { read, timeoutMs: 1000, log: mock<RelatedMemoryLookup['log']>() },
  });

  await ctx.seed();

  const defineInput = buildTestDefineInput({ name: 'Water the tomatoes', brief: 'Water them.' });
  const input = parseJSONObject(JSON.stringify(defineInput));

  const outcome = await tool.run(
    buildMockToolCall({ tool: 'task.define', input }),
    buildMockToolContext(),
  );

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { related: [{ shortID: 'k3m9q2xzab', text: 'The tomatoes are in the greenhouse' }] },
  });

  expect(read.mock.calls).toStrictEqual([['Water the tomatoes\nWater them.']]);
});

test('it stores an at without an offset with the offset of the owner zone', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  await ctx.define(
    buildTestDefineInput({
      name: 'Book the dentist',
      brief: 'Book the dentist.',
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

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { refused: { code: 'ID_TAKEN' } },
    refusalCode: 'ID_TAKEN',
  });
});

test('it returns NOT_FOUND for a replacement of a definition that does not exist', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  const outcome = await ctx.define(buildTestDefineInput({ definitionID: 'feed-the-cat' }));

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { refused: { code: 'NOT_FOUND' } },
    refusalCode: 'NOT_FOUND',
  });
});

test('it returns UNCHANGED for a replacement that holds the version in force', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml());
  await ctx.seed();

  const outcome = await ctx.define(buildTestDefineInput({ definitionID: 'water-the-tomatoes' }));

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { refused: { code: 'UNCHANGED' } },
    refusalCode: 'UNCHANGED',
  });
});

test('it returns FILE_ONLY_KEYS for a replacement of a definition that holds an instructions file', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml(), {
    'instructions.md': 'Water the tomatoes at the roots.\n',
  });

  await ctx.seed();

  const outcome = await ctx.define(
    buildTestDefineInput({ definitionID: 'water-the-tomatoes', brief: 'Water them well.' }),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { refused: { code: 'FILE_ONLY_KEYS' } },
    refusalCode: 'FILE_ONLY_KEYS',
  });
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
    refusalCode: 'ONE_SHOT_OVER_REPO',
  });
});

test('it returns INVALID with the reasons for a version that a start refuses', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  const outcome = await ctx.define(buildTestDefineInput({ tools: ['files.write'] }));

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { refused: { code: 'INVALID', reasons: expect.any(Array) } },
    refusalCode: 'INVALID',
  });
});

test('it defines a task that sets self notes and reads the grant back', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  const outcome = await ctx.define(buildTestDefineInput({ memory: 'self_notes' }));
  const hashes = await ctx.readHashes();
  const version = await readDefinitionVersion(ctx.writer.db, hashes[0] ?? '');

  expect([outcome.status, version?.memory]).toStrictEqual(['ok', 'self_notes']);
});

test('it declares policy_widen for a call that sets self notes, so the call asks', async () => {
  const ctx = await setupTest();

  const prepare = ctx.tool.prepare;

  invariant(prepare);

  const context = buildMockToolContext();

  const inputs = ['self_notes', 'read', 'none'].map((memory) =>
    buildTestDefineInput({ memory: z.enum(['none', 'read', 'self_notes']).parse(memory) }),
  );

  const prepared = await Promise.all(
    inputs.map((input) => prepare(parseJSONObject(JSON.stringify(input)), context)),
  );

  expect(prepared).toStrictEqual([
    { destinations: [], effects: ['policy_widen'] },
    { destinations: [] },
    { destinations: [] },
  ]);
});

test('it refuses a schedule that mixes fields with the field and a fix', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  const outcome = await ctx.define(
    buildTestDefineInput({
      trigger: { schedule: { repeat: { frequency: 'daily' }, zone: 'owner', catchUp: 'once' } },
    }),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      refused: {
        code: 'AT_REQUIRED',
        path: 'trigger.schedule.repeat.at',
        sentence: expect.stringContaining('add repeat.at'),
      },
    },
    refusalCode: 'AT_REQUIRED',
  });
});

test('it defines a task that fires hourly in the hours of weekdays', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  const outcome = await ctx.define(
    buildTestDefineInput({
      trigger: {
        schedule: {
          repeat: { frequency: 'hourly', byDay: ['mon', 'tue', 'wed', 'thu', 'fri'] },
          hours: { from: '09:00', until: '17:00' },
          zone: 'owner',
          catchUp: 'once',
        },
      },
    }),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      definitionID: 'water-the-tomatoes',
      rendered: 'every hour, on weekdays between 09:00 and 17:00 (Europe/Paris)',
      next: expect.any(String),
      changeID: expect.any(String),
    },
  });
});

test('it returns INVALID for a name with an empty slug', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  const outcome = await ctx.define(buildTestDefineInput({ name: '!!!' }));

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { refused: { code: 'INVALID', reasons: expect.any(Array) } },
    refusalCode: 'INVALID',
  });
});

test('it resets the model to the default when a change omits it', async () => {
  const ctx = await setupTest();

  await ctx.seed();
  await ctx.define(buildTestDefineInput({ model: 'second-look' }));

  await ctx.define(
    buildTestDefineInput({
      definitionID: 'water-the-tomatoes',
      brief: 'Water them well.',
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

test('it resolves the omitted connections before approval, so an account that connects later never joins the job', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  const input = buildTestDefineInput({ tools: ['time.now'] });

  const resolved = await ctx.resolve(input);

  ctx.usable.now = { 'time.now': ['k3x9m2p7qa', 'p8d2v6n4rc'] };

  const approved = resolved?.status === 'ok' ? resolved.input : {};

  await ctx.define(approved);

  const hashes = await ctx.readHashes();
  const version = await readDefinitionVersion(ctx.writer.db, hashes[0] ?? '');

  expect([resolved, version?.connections]).toStrictEqual([
    {
      status: 'ok',
      input: parseJSONObject(JSON.stringify({ ...input, connections: ['k3x9m2p7qa'] })),
    },
    { 'time.now': ['k3x9m2p7qa'] },
  ]);
});

test('it pins a tool to no account of a definition that was approved when none was connected', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  ctx.usable.now = { 'time.now': [] };

  const resolved = await ctx.resolve(buildTestDefineInput({ tools: ['time.now'] }));

  ctx.usable.now = { 'time.now': ['k3x9m2p7qa'] };

  const approved = resolved?.status === 'ok' ? resolved.input : {};

  await ctx.define(approved);

  const hashes = await ctx.readHashes();
  const version = await readDefinitionVersion(ctx.writer.db, hashes[0] ?? '');

  expect(version?.connections).toStrictEqual({ 'time.now': [] });
});

test('it leaves the input of a call that lists no connector tool as it is', async () => {
  const ctx = await setupTest();

  const input = buildTestDefineInput({ tools: ['tasks.list'] });

  const resolved = await ctx.resolve(input);

  expect(resolved).toStrictEqual({
    status: 'ok',
    input: parseJSONObject(JSON.stringify(input)),
  });
});
