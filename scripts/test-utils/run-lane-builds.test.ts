import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubBin, readStubCalls } from '@zgeoff/testing/bin';
import { runLaneBuilds } from './run-lane-builds';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-lane-builds-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const binDir = join(directory, 'bin');

  return {
    binDir,
    env: { PATH: `${binDir}:/usr/bin:/bin` },
  };
}

test('it runs each build script in order', async () => {
  const ctx = await setupTest();

  createStubBin(ctx.binDir, 'bun');
  runLaneBuilds(ctx.env, ['build:kiosk', 'build:ledger']);

  const calls = readStubCalls(ctx.binDir).map((call) => call.argv);

  expect(calls).toStrictEqual([
    ['run', 'build:kiosk'],
    ['run', 'build:ledger'],
  ]);
});

test('it throws on a build that fails, and runs none after it', async () => {
  const ctx = await setupTest();

  createStubBin(ctx.binDir, 'bun', {
    answers: [{ args: ['run', 'build:kiosk'], exitCode: 3 }],
  });

  expect(() => {
    runLaneBuilds(ctx.env, ['build:kiosk', 'build:ledger']);
  }).toThrowWithMessage(Error, 'bun run build:kiosk exited with 3');

  const calls = readStubCalls(ctx.binDir).map((call) => call.argv);

  expect(calls).toStrictEqual([['run', 'build:kiosk']]);
});
