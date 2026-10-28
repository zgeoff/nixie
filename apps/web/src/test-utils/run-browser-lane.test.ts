import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBrowserLane } from './run-browser-lane';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-browser-lane-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it removes the run folder and the Chrome temp folder when the tests fail', async () => {
  const ctx = await setupTest();

  const runDir = join(ctx.directory, 'runs', '4417');

  const exitCode = await runBrowserLane(['.browser.test.ts'], {
    chromeTmpdir: join(ctx.directory, 'chrome', '4417'),
    run: {
      runID: '4417',
      runsDir: join(ctx.directory, 'runs'),
      runDir,
      webDir: join(runDir, 'web'),
      webServerPath: join(runDir, 'web', 'server', 'server.js'),
      normalizeImagePath: join(runDir, 'normalize-image.js'),
      profilesDir: join(runDir, 'profiles'),
    },
    runBuilds: () => Promise.resolve(),
    runTests: () => Promise.resolve(1),
  });

  const runs = await readdir(join(ctx.directory, 'runs'));
  const chromeTmpdirs = await readdir(join(ctx.directory, 'chrome'));

  expect(exitCode).toBe(1);
  expect(runs).toStrictEqual([]);
  expect(chromeTmpdirs).toStrictEqual([]);
});

test("it gives the tests the run's ID and the Chrome temp folder", async () => {
  const ctx = await setupTest();

  const runDir = join(ctx.directory, 'runs', '4417');
  const chromeTmpdir = join(ctx.directory, 'chrome', '4417');
  const runTests = mock(() => Promise.resolve(0));

  await runBrowserLane(['.browser.test.ts'], {
    chromeTmpdir,
    run: {
      runID: '4417',
      runsDir: join(ctx.directory, 'runs'),
      runDir,
      webDir: join(runDir, 'web'),
      webServerPath: join(runDir, 'web', 'server', 'server.js'),
      normalizeImagePath: join(runDir, 'normalize-image.js'),
      profilesDir: join(runDir, 'profiles'),
    },
    runBuilds: () => Promise.resolve(),
    runTests,
  });

  expect(runTests).toHaveBeenCalledExactlyOnceWith(
    ['.browser.test.ts'],
    expect.objectContaining({ NIXIE_BROWSER_RUN_ID: '4417', TMPDIR: chromeTmpdir }),
  );
});
