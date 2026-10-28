import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { waitFor } from '@testing-library/react';
import { makeWebBuildStep } from './make-web-build-step';
import { runBrowserLane } from './run-browser-lane';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-browser-lane-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const runsDir = join(directory, 'runs');
  const runDir = join(runsDir, '4417');

  return {
    chromeDir: join(directory, 'chrome'),
    chromeTmpdir: join(directory, 'chrome', '4417'),
    run: {
      runID: '4417',
      runsDir,
      runDir,
      webDir: join(runDir, 'web'),
      webServerPath: join(runDir, 'web', 'server', 'server.js'),
      normalizeImagePath: join(runDir, 'normalize-image.js'),
      profilesDir: join(runDir, 'profiles'),
    },
  };
}

test('it removes the run folder and the Chrome temp folder when the tests pass', async () => {
  const ctx = await setupTest();

  const exitCode = await runBrowserLane(['.browser.test.ts'], {
    chromeTmpdir: ctx.chromeTmpdir,
    run: ctx.run,
    runBuilds: () => Promise.resolve(0),
    runTests: () => Promise.resolve(0),
    signal: new AbortController().signal,
  });

  const runs = await readdir(ctx.run.runsDir);
  const chromeTmpdirs = await readdir(ctx.chromeDir);

  expect(exitCode).toBe(0);
  expect(runs).toStrictEqual([]);
  expect(chromeTmpdirs).toStrictEqual([]);
});

test('it removes the run folder and the Chrome temp folder when the tests fail', async () => {
  const ctx = await setupTest();

  const exitCode = await runBrowserLane(['.browser.test.ts'], {
    chromeTmpdir: ctx.chromeTmpdir,
    run: ctx.run,
    runBuilds: () => Promise.resolve(0),
    runTests: () => Promise.resolve(1),
    signal: new AbortController().signal,
  });

  const runs = await readdir(ctx.run.runsDir);
  const chromeTmpdirs = await readdir(ctx.chromeDir);

  expect(exitCode).toBe(1);
  expect(runs).toStrictEqual([]);
  expect(chromeTmpdirs).toStrictEqual([]);
});

test('it fails and removes the run folder when it cannot create the Chrome temp folder', async () => {
  const ctx = await setupTest();

  const runTests = mock(() => Promise.resolve(0));

  await Bun.write(ctx.chromeDir, 'a file where the Chrome folder goes');

  const lane = runBrowserLane(['.browser.test.ts'], {
    chromeTmpdir: ctx.chromeTmpdir,
    run: ctx.run,
    runBuilds: () => Promise.resolve(0),
    runTests,
    signal: new AbortController().signal,
  });

  const failure = await lane.then(
    () => null,
    (error: unknown) => error,
  );

  const runs = await readdir(ctx.run.runsDir);

  expect(failure).toMatchObject({ message: 'the browser lane could not create its folders' });
  expect(runTests).not.toHaveBeenCalled();
  expect(runs).toStrictEqual([]);
});

test("it gives the tests the run's ID and the Chrome temp folder", async () => {
  const ctx = await setupTest();

  const runTests = mock(() => Promise.resolve(0));

  const signal = new AbortController().signal;

  await runBrowserLane(['.browser.test.ts'], {
    chromeTmpdir: ctx.chromeTmpdir,
    run: ctx.run,
    runBuilds: () => Promise.resolve(0),
    runTests,
    signal,
  });

  expect(runTests).toHaveBeenCalledExactlyOnceWith(
    ['.browser.test.ts'],
    expect.objectContaining({ NIXIE_BROWSER_RUN_ID: '4417', TMPDIR: ctx.chromeTmpdir }),
    signal,
  );
});

test('it starts the tests only once the build finishes', async () => {
  const ctx = await setupTest();

  const build = Promise.withResolvers<number>();
  const runBuilds = mock(() => build.promise);
  const runTests = mock(() => Promise.resolve(0));

  const lane = runBrowserLane(['.browser.test.ts'], {
    chromeTmpdir: ctx.chromeTmpdir,
    run: ctx.run,
    runBuilds,
    runTests,
    signal: new AbortController().signal,
  });

  await waitFor(() => {
    expect(runBuilds).toHaveBeenCalledOnce();
  });

  const testRunsDuringBuild = runTests.mock.calls.length;

  build.resolve(0);

  await lane;

  expect(testRunsDuringBuild).toBe(0);
  expect(runTests).toHaveBeenCalledOnce();
});

test('it fails without running the tests, and removes its folders, when the web build fails', async () => {
  const ctx = await setupTest();

  const runTests = mock(() => Promise.resolve(0));

  const exitCode = await runBrowserLane(['.browser.test.ts'], {
    chromeTmpdir: ctx.chromeTmpdir,
    run: ctx.run,
    runBuilds: makeWebBuildStep([process.execPath, '-e', 'process.exit(2)']),
    runTests,
    signal: new AbortController().signal,
  });

  const runs = await readdir(ctx.run.runsDir);
  const chromeTmpdirs = await readdir(ctx.chromeDir);

  expect(exitCode).toBe(2);
  expect(runTests).not.toHaveBeenCalled();
  expect(runs).toStrictEqual([]);
  expect(chromeTmpdirs).toStrictEqual([]);
});

test('it waits for an aborted build to exit, then removes its folders and starts no tests', async () => {
  const ctx = await setupTest();

  const build = Promise.withResolvers<number>();
  const runBuilds = mock(() => build.promise);
  const runTests = mock(() => Promise.resolve(0));

  const controller = new AbortController();

  const lane = runBrowserLane(['.browser.test.ts'], {
    chromeTmpdir: ctx.chromeTmpdir,
    run: ctx.run,
    runBuilds,
    runTests,
    signal: controller.signal,
  });

  await waitFor(() => {
    expect(runBuilds).toHaveBeenCalledOnce();
  });

  controller.abort();

  const runsBeforeBuildExit = await readdir(ctx.run.runsDir);

  build.resolve(143);

  const exitCode = await lane;
  const runs = await readdir(ctx.run.runsDir);
  const chromeTmpdirs = await readdir(ctx.chromeDir);

  expect(runBuilds).toHaveBeenCalledExactlyOnceWith(ctx.run, controller.signal);
  expect(runsBeforeBuildExit).toStrictEqual(['4417']);
  expect(exitCode).toBe(1);
  expect(runTests).not.toHaveBeenCalled();
  expect(runs).toStrictEqual([]);
  expect(chromeTmpdirs).toStrictEqual([]);
});
