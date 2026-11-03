import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStubContractEnv } from '../test-utils/build-stub-contract-env';
import { startStubModel } from '../test-utils/start-stub-model';
import { runToolListProbe } from './run-tool-list-probe';

async function setupTest() {
  const model = startStubModel();

  onTestFinished(() => model.stop());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-probe-tool-list-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    model,
    target: { directory, env: buildStubContractEnv(process.env, model.url, directory) },
  };
}

test('it lists a tool in its changed form on the next turn of a resumed session', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__note_read', input: { name: 'groceries' } } },
    { text: 'DONE' },
    { toolUse: { name: 'mcp__nixie__note_read', input: { noteID: 'n7k2' } } },
    { text: 'DONE' },
  );

  await runToolListProbe(ctx.target, 'resumed-session');

  const listed = ctx.model.requests.map(
    (request) =>
      request.body?.tools?.find((tool) => tool.name === 'mcp__nixie__note_read')?.input_schema,
  );

  expect(listed).toStrictEqual([
    { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    { type: 'object', properties: { noteID: { type: 'string' } }, required: ['noteID'] },
    { type: 'object', properties: { noteID: { type: 'string' } }, required: ['noteID'] },
  ]);
});

test('it keeps the recorded form of a tool on a resumed session that snapshots its system prompt', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__note_read', input: { name: 'groceries' } } },
    { text: 'DONE' },
    { toolUse: { name: 'mcp__nixie__note_read', input: { name: 'groceries' } } },
    { text: 'DONE' },
  );

  await runToolListProbe(ctx.target, 'resumed-snapshot');

  const listed = ctx.model.requests.map(
    (request) =>
      request.body?.tools?.find((tool) => tool.name === 'mcp__nixie__note_read')?.input_schema,
  );

  expect(listed).toStrictEqual([
    { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  ]);
});

test('it lists a tool in its first form at the next step of a turn when the server sends no notice', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__note_wait', input: {} } },
    { toolUse: { name: 'mcp__nixie__note_read', input: { name: 'groceries' } } },
    { text: 'DONE' },
  );

  await runToolListProbe(ctx.target, 'mid-turn-silent');

  const listed = ctx.model.requests.map(
    (request) =>
      request.body?.tools?.find((tool) => tool.name === 'mcp__nixie__note_read')?.input_schema,
  );

  expect(listed).toStrictEqual([
    { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  ]);
});

test('it closes its tool server when the test finishes', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__note_wait', input: {} } },
    { toolUse: { name: 'mcp__nixie__note_read', input: { name: 'groceries' } } },
    { text: 'DONE' },
  );

  const probe = await runToolListProbe(ctx.target, 'mid-turn-silent');

  onTestFinished(() => {
    expect(fetch(probe.toolsURL, { method: 'POST' })).rejects.toThrow();
  });
});

test('it fails a mid-turn run whose model ends the turn before it calls note_wait', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'DONE' });

  expect(runToolListProbe(ctx.target, 'mid-turn-silent')).rejects.toThrow(
    'the model ended the turn of the tool-list probe before it called note_wait',
  );
});

test('it lists a tool in its changed form at the next step of a turn once it lists the tools after a notice', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__note_wait', input: {} } },
    { toolUse: { name: 'mcp__nixie__note_read', input: { noteID: 'n7k2' } } },
    { text: 'DONE' },
  );

  await runToolListProbe(ctx.target, 'mid-turn-notice');

  const listed = ctx.model.requests.map(
    (request) =>
      request.body?.tools?.find((tool) => tool.name === 'mcp__nixie__note_read')?.input_schema,
  );

  expect(listed).toStrictEqual([
    { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    { type: 'object', properties: { noteID: { type: 'string' } }, required: ['noteID'] },
    { type: 'object', properties: { noteID: { type: 'string' } }, required: ['noteID'] },
  ]);
});
