import { expect, mock, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { runDefinitionsExports } from '../skill/run-definitions-exports';
import { buildStubDefinitionsRepo } from '../test-utils/build-stub-definitions-repo';
import { buildTestDefineInput } from '../test-utils/build-test-define-input';
import { buildTestTaskSeed } from '../test-utils/build-test-task-seed';
import { buildTestTaskYaml } from '../test-utils/build-test-task-yaml';
import { readTestTaskDefinitionExports } from '../test-utils/read-test-task-definition-exports';
import { startTestDefinitions } from '../test-utils/start-test-definitions';
import type { DefinitionsTables } from '../types';
import { buildTaskChangeKind } from './build-task-change-kind';
import { requestDefinitionChange } from './request-definition-change';

async function setupTest() {
  const defs = await startTestDefinitions();

  const repo = buildStubDefinitionsRepo(defs.root);
  const onError = mock<(error: unknown) => void>();

  return {
    ...defs,
    repo,
    onError,
    runExports: () =>
      runDefinitionsExports({
        log: defs.log,
        repo,
        kinds: [buildTaskChangeKind({ log: defs.log, tasks: buildTestTaskSeed() })],
        onError,
      }),
    readOpenFiles: () => {
      const [request] = repo.readPullRequests();

      return Object.fromEntries(request?.change.files ?? []);
    },
    readStoredFiles: async (definitionID: string) => {
      const row = await defs.writer.db
        .$extendTables<DefinitionsTables>()
        .selectFrom('task_definition_versions')
        .select('files')
        .where('definition_id', '=', definitionID)
        .executeTakeFirstOrThrow();

      return z.record(z.string(), z.string()).parse(JSON.parse(row.files));
    },
    writeRepoFiles: async (files: Readonly<Record<string, string>>) => {
      for (const [path, text] of Object.entries(files)) {
        await mkdir(dirname(join(defs.root, path)), { recursive: true });
        await writeFile(join(defs.root, path), text);
      }
    },
  };
}

test('it exports the folder of a defined schedule byte for byte to one pull request', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  await requestDefinitionChange(ctx.context, { kind: 'define', input: buildTestDefineInput() });

  await ctx.runExports();

  const stored = await ctx.readStoredFiles('water-the-tomatoes');

  expect(
    ctx.repo.readPullRequests().map((request) => ({
      state: request.state,
      branch: request.change.branch,
      files: Object.fromEntries(request.change.files),
    })),
  ).toStrictEqual([{ state: 'open', branch: 'nixie/tasks', files: stored }]);

  expect(Object.keys(stored)).toContain('tasks/water-the-tomatoes/task.yaml');
});

test('it opens no pull request for a one-shot', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: buildTestDefineInput({ trigger: { at: '2027-03-12T08:00:00+01:00' } }),
  });

  await ctx.runExports();

  expect(ctx.repo.readPullRequests()).toStrictEqual([]);
});

test('it deletes every file of the folder of an undefined definition, and no other file', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml());
  await ctx.writeRepoTask('feed-the-cat', buildTestTaskYaml());
  await ctx.writeRepoFiles({ 'tasks/water-the-tomatoes/notes.md': 'Use the green can.\n' });
  await ctx.seed();

  await requestDefinitionChange(ctx.context, {
    kind: 'undefine',
    definitionID: 'water-the-tomatoes',
  });

  await ctx.runExports();

  expect(ctx.readOpenFiles()).toStrictEqual({
    'tasks/water-the-tomatoes/task.yaml': null,
    'tasks/water-the-tomatoes/notes.md': null,
  });
});

test('it fails the export and opens no pull request when the repo reads format 3', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  await requestDefinitionChange(ctx.context, { kind: 'define', input: buildTestDefineInput() });

  await ctx.writeRepoFiles({ 'nixie.yaml': 'format: 3\n' });
  await ctx.runExports();

  expect(ctx.onError).toHaveBeenCalledTimes(1);
  expect(ctx.repo.readPullRequests()).toStrictEqual([]);
});

test('it fails the export and opens no pull request when the repo already holds the files', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  await requestDefinitionChange(ctx.context, { kind: 'define', input: buildTestDefineInput() });

  const stored = await ctx.readStoredFiles('water-the-tomatoes');

  await ctx.writeRepoFiles(stored);
  await ctx.runExports();

  expect(ctx.onError).toHaveBeenCalledTimes(1);
  expect(ctx.repo.readPullRequests()).toStrictEqual([]);
});

test('it rewrites the same pull request for a second runtime change', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  await requestDefinitionChange(ctx.context, { kind: 'define', input: buildTestDefineInput() });

  await ctx.runExports();

  await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: buildTestDefineInput({ name: 'Feed the cat' }),
  });

  await ctx.runExports();

  expect(
    ctx.repo.readPullRequests().map((request) => ({
      number: request.number,
      state: request.state,
      files: [...request.change.files.keys()].toSorted(),
    })),
  ).toStrictEqual([
    {
      number: 1,
      state: 'open',
      files: expect.arrayContaining([
        'tasks/feed-the-cat/task.yaml',
        'tasks/water-the-tomatoes/task.yaml',
      ]),
    },
  ]);

  const exports = await readTestTaskDefinitionExports(ctx.writer);

  expect(exports.map((row) => row.state).toSorted()).toStrictEqual(['closed', 'opened']);
});

test('it closes the open pull request once the repo adopts the last change', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  await requestDefinitionChange(ctx.context, { kind: 'define', input: buildTestDefineInput() });

  await ctx.runExports();

  const stored = await ctx.readStoredFiles('water-the-tomatoes');

  await ctx.writeRepoFiles(stored);
  await ctx.seed();
  await ctx.runExports();

  expect(ctx.repo.readPullRequests().map((request) => request.state)).toStrictEqual(['closed']);
});

test('it leaves a merged pull request merged once the repo adopts the change', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  await requestDefinitionChange(ctx.context, { kind: 'define', input: buildTestDefineInput() });

  await ctx.runExports();
  await ctx.repo.mergePullRequest(1);
  await ctx.seed();
  await ctx.runExports();

  expect(ctx.repo.readPullRequests().map((request) => request.state)).toStrictEqual(['merged']);

  const exports = await readTestTaskDefinitionExports(ctx.writer);

  expect(exports.map((row) => row.state)).toStrictEqual(['closed']);
});

test('it exports when the manifest writes its format in flow style', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  await requestDefinitionChange(ctx.context, { kind: 'define', input: buildTestDefineInput() });

  await ctx.writeRepoFiles({ 'nixie.yaml': '{format: 4}\n' });
  await ctx.runExports();

  expect(ctx.onError).not.toHaveBeenCalled();
  expect(ctx.repo.readPullRequests().map((request) => request.state)).toStrictEqual(['open']);
});

test('it opens a pull request that deletes the invalid folder of an undefined definition', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml());
  await ctx.seed();
  await ctx.writeRepoFiles({ 'tasks/water-the-tomatoes/task.yaml': 'name: [\n' });

  await requestDefinitionChange(ctx.context, {
    kind: 'undefine',
    definitionID: 'water-the-tomatoes',
  });

  await ctx.runExports();

  expect(ctx.onError).not.toHaveBeenCalled();

  expect(ctx.readOpenFiles()).toStrictEqual({
    'tasks/water-the-tomatoes/task.yaml': null,
  });
});
