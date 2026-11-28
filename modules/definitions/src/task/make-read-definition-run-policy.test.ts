import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { JSONObject } from '@heynixie/log';
import { startWriter, withWriteTransaction } from '@heynixie/log';
import { makeReadDefinitionRunPolicy } from './make-read-definition-run-policy';
import { writeTaskVersions } from './write-task-versions';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-run-policy-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  return {
    writer,
    readPolicy: makeReadDefinitionRunPolicy({ turns: 25, dollars: 2 }),
    writeVersion: (form: JSONObject) =>
      withWriteTransaction(writer, (tx) =>
        writeTaskVersions(tx, [{ id: 'water-plants', hash: 'hash-1', form, files: {} }]),
      ),
  };
}

test('it reads null for a hash that no version holds', async () => {
  const ctx = await setupTest();
  const policy = await ctx.readPolicy(ctx.writer.db, 'task-1', 'hash-missing');

  expect(policy).toBeNull();
});

test('it gives the default limits and no report for a file that sets neither', async () => {
  const ctx = await setupTest();

  await ctx.writeVersion({ name: 'Water', brief: 'Water the plants.', wakeable: false });

  const policy = await ctx.readPolicy(ctx.writer.db, 'task-1', 'hash-1');

  expect(policy).toStrictEqual({
    report: null,
    reportShape: null,
    wakeable: false,
    limits: { turns: 25, dollars: 2, calls: {} },
  });
});

test('it overrides each limit the file sets and copies the call caps', async () => {
  const ctx = await setupTest();

  await ctx.writeVersion({
    name: 'Water',
    brief: 'Water the plants.',
    wakeable: true,
    report: 'wake',
    limits: { turns: 5 },
    maxCalls: { 'web.fetch': 3 },
  });

  const policy = await ctx.readPolicy(ctx.writer.db, 'task-1', 'hash-1');

  expect(policy).toStrictEqual({
    report: 'wake',
    reportShape: null,
    wakeable: true,
    limits: { turns: 5, dollars: 2, calls: { 'web.fetch': 3 } },
  });
});

test('it parses the report shape of the file', async () => {
  const ctx = await setupTest();

  await ctx.writeVersion({
    name: 'Water',
    brief: 'Water the plants.',
    wakeable: false,
    reportShape: {
      type: 'object',
      additionalProperties: false,
      properties: { watered: { type: 'integer' } },
    },
  });

  const policy = await ctx.readPolicy(ctx.writer.db, 'task-1', 'hash-1');

  expect(policy?.reportShape).toStrictEqual({
    additionalProperties: false,
    properties: { watered: { type: 'integer' } },
    type: 'object',
  });
});

test('it gives a job run no limit on a meter that neither its file nor the config sets', async () => {
  const ctx = await setupTest();

  const readPolicy = makeReadDefinitionRunPolicy({ turns: null, dollars: null });

  await ctx.writeVersion({
    name: 'Water',
    brief: 'Water the plants.',
    wakeable: false,
    limits: { dollars: 3 },
  });

  const policy = await readPolicy(ctx.writer.db, 'task-1', 'hash-1');

  expect(policy?.limits).toStrictEqual({ turns: null, dollars: 3, calls: {} });
});
