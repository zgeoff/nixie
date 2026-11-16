import { expect, mock, test } from 'bun:test';
import { z } from 'zod';
import { runHostCommand } from '../test-utils/run-host-command';
import { startInProcessNixie } from '../test-utils/start-in-process-nixie';
import { runCLI } from './run-cli';

async function setupTest() {
  const nixie = await startInProcessNixie({
    hasStarterRules: false,
    beforeStart: (_files, seed) => seed.definitionConflict(),
  });

  await nixie.waitForLogEvent('ready');

  return nixie;
}

test('it ends a conflict with --keep nixie and leaves the change in force', async () => {
  const ctx = await setupTest();

  const resolved = await runHostCommand(ctx.configPath, [
    'definitions',
    'resolve',
    'water-the-tomatoes',
    '--keep',
    'nixie',
  ]);

  ctx.signalStop();

  const exited = await ctx.waitForExit();

  const records = exited.records;
  const changed = records.find((record) => record.kind === 'definition.changed');
  const kept = records.filter((record) => record.kind === 'definition.conflict_resolved');

  const hashes = records
    .filter((record) => record.kind === 'task.definition_set')
    .map((record) => z.object({ definitionHash: z.string().nullable() }).parse(record.payload))
    .map((binding) => binding.definitionHash);

  const nixieHash = z.string().parse(changed?.payload['hash']);

  expect({
    exitCode: resolved.exitCode,
    resolved: z.unknown().parse(JSON.parse(resolved.stdout)),
    kept: kept.map((record) => record.payload['keep']),
    lastHash: hashes.at(-1),
  }).toStrictEqual({
    exitCode: 0,
    resolved: { definitionID: 'water-the-tomatoes', changeID: expect.any(String), keep: 'nixie' },
    kept: ['nixie'],
    lastHash: nixieHash,
  });
});

test('it retires the change with --keep repo and puts the repo version in force', async () => {
  const ctx = await setupTest();

  const resolved = await runHostCommand(ctx.configPath, [
    'definitions',
    'resolve',
    'water-the-tomatoes',
    '--keep',
    'repo',
  ]);

  ctx.signalStop();

  const exited = await ctx.waitForExit();

  const records = exited.records;
  const changed = records.find((record) => record.kind === 'definition.changed');
  const kept = records.filter((record) => record.kind === 'definition.conflict_resolved');

  const hashes = records
    .filter((record) => record.kind === 'task.definition_set')
    .map((record) => z.object({ definitionHash: z.string().nullable() }).parse(record.payload))
    .map((binding) => binding.definitionHash);

  const nixieHash = z.string().parse(changed?.payload['hash']);

  expect({
    exitCode: resolved.exitCode,
    kept: kept.map((record) => record.payload['keep']),
    lastHashIsNixies: hashes.at(-1) === nixieHash,
  }).toStrictEqual({ exitCode: 0, kept: ['repo'], lastHashIsNixies: false });
});

test('it leaves no conflict to resolve once --keep nixie has ended it', async () => {
  const ctx = await setupTest();

  await runHostCommand(ctx.configPath, [
    'definitions',
    'resolve',
    'water-the-tomatoes',
    '--keep',
    'nixie',
  ]);

  const again = await runHostCommand(ctx.configPath, [
    'definitions',
    'resolve',
    'water-the-tomatoes',
    '--keep',
    'nixie',
  ]);

  expect(again.exitCode).toBe(1);
});

test('it refuses a definition that has no conflict', async () => {
  const nixie = await startInProcessNixie({ hasStarterRules: false });

  await nixie.waitForLogEvent('ready');

  const resolved = await runHostCommand(nixie.configPath, [
    'definitions',
    'resolve',
    'water-the-tomatoes',
    '--keep',
    'repo',
  ]);

  expect(resolved.exitCode).toBe(1);
});

test.each([
  ['a resolve with no --keep', ['definitions', 'resolve', 'water-the-tomatoes']],
  [
    'a resolve that keeps the definitions',
    ['definitions', 'resolve', 'water-the-tomatoes', '--keep', 'definitions'],
  ],
  [
    'a resolve with a second definition ID',
    ['definitions', 'resolve', 'water-the-tomatoes', 'feed-the-cat', '--keep', 'repo'],
  ],
])('it refuses %s while it reads the arguments', async (_name, argv) => {
  const io = { log: mock(), print: mock(), waitForSignal: mock() };

  const exitCode = await runCLI([...argv, '--config', '/nonexistent/config.yaml'], io);

  expect({ exitCode, printed: io.print.mock.calls.length }).toStrictEqual({
    exitCode: 1,
    printed: 1,
  });
});
