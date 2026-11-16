import { expect, test } from 'bun:test';
import { runProjectionRebuild, writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readTestTaskDefinitionExports } from '../test-utils/read-test-task-definition-exports';
import { startTestDefinitions } from '../test-utils/start-test-definitions';
import { definitionExportMovedCodec } from './definition-export-moved-codec';

async function setupTest() {
  const ctx = await startTestDefinitions();

  return {
    ...ctx,
    writeMove: (move: Parameters<typeof definitionExportMovedCodec.encode>[0]) =>
      writeRecords(ctx.log, [
        {
          kind: definitionExportMovedCodec.kind,
          definitions: { snapshotHash: 'sha256:test' },
          payload: definitionExportMovedCodec.encode(move),
        },
      ]),
    readRows: () => readTestTaskDefinitionExports(ctx.writer),
  };
}

test('it records the start of an export attempt with no state yet', async () => {
  const ctx = await setupTest();

  const [record] = await ctx.writeMove({
    exportID: 'e1',
    branch: 'nixie/tasks',
    to: 'exporting',
    pullRequest: null,
  });

  invariant(record);

  const rows = await ctx.readRows();

  expect(rows).toStrictEqual([
    {
      export_id: 'e1',
      branch: 'nixie/tasks',
      state: null,
      pull_request_number: null,
      pull_request_url: null,
      attempt_started_sequence: record.sequence,
      updated_sequence: record.sequence,
    },
  ]);
});

test('it records an opened pull request and ends the attempt', async () => {
  const ctx = await setupTest();

  await ctx.writeMove({
    exportID: 'e1',
    branch: 'nixie/tasks',
    to: 'exporting',
    pullRequest: null,
  });

  await ctx.writeMove({
    exportID: 'e1',
    branch: 'nixie/tasks',
    to: 'opened',
    pullRequest: { number: 12, url: 'https://example.test/pull/12' },
  });

  const rows = await ctx.readRows();

  expect(rows).toStrictEqual([
    {
      export_id: 'e1',
      branch: 'nixie/tasks',
      state: 'opened',
      pull_request_number: 12,
      pull_request_url: 'https://example.test/pull/12',
      attempt_started_sequence: null,
      updated_sequence: expect.any(Number),
    },
  ]);
});

test('it keeps the pull request when an export closes with none named', async () => {
  const ctx = await setupTest();

  await ctx.writeMove({
    exportID: 'e1',
    branch: 'nixie/tasks',
    to: 'opened',
    pullRequest: { number: 12, url: 'https://example.test/pull/12' },
  });

  await ctx.writeMove({ exportID: 'e1', branch: 'nixie/tasks', to: 'closed', pullRequest: null });

  const rows = await ctx.readRows();

  expect(rows).toMatchObject([{ state: 'closed', pull_request_number: 12 }]);
});

test('it rebuilds the same rows from the records', async () => {
  const ctx = await setupTest();

  await ctx.writeMove({
    exportID: 'e1',
    branch: 'nixie/tasks',
    to: 'exporting',
    pullRequest: null,
  });

  await ctx.writeMove({
    exportID: 'e1',
    branch: 'nixie/tasks',
    to: 'opened',
    pullRequest: { number: 12, url: 'https://example.test/pull/12' },
  });

  const before = await ctx.readRows();

  await runProjectionRebuild(ctx.log);

  const rows = await ctx.readRows();

  expect(rows).toStrictEqual(before);
});
