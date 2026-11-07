import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubProgram } from './create-stub-program';
import { runLaneBuilds } from './run-lane-builds';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-lane-builds-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const binDir = join(directory, 'bin');

  return {
    bunPath: join(binDir, 'bun'),
    callsPath: join(directory, 'calls'),
    env: { PATH: `${binDir}:/usr/bin:/bin` },
  };
}

test('it runs each build script in order', async () => {
  const ctx = await setupTest();

  createStubProgram(ctx.bunPath, { callsPath: ctx.callsPath });
  runLaneBuilds(ctx.env, ['build:kiosk', 'build:ledger']);

  const calls = await readFile(ctx.callsPath, 'utf8');

  expect(calls).toBe('bun run build:kiosk\nbun run build:ledger\n');
});

test('it throws on a build that fails, and runs none after it', async () => {
  const ctx = await setupTest();

  createStubProgram(ctx.bunPath, {
    callsPath: ctx.callsPath,
    answers: { 'run build:kiosk': { exitCode: 3 } },
  });

  expect(() => {
    runLaneBuilds(ctx.env, ['build:kiosk', 'build:ledger']);
  }).toThrowWithMessage(Error, 'bun run build:kiosk exited with 3');

  const calls = await readFile(ctx.callsPath, 'utf8');

  expect(calls).toBe('bun run build:kiosk\n');
});
