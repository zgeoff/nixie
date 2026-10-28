import { expect, mock, test } from 'bun:test';
import { buildStubPendingStep } from './build-stub-pending-step';
import { runBrowserLane } from './run-browser-lane';

test('it removes the run folder and the Chrome temp folder when the tests fail', async () => {
  const removeDir = mock(() => Promise.resolve());

  const exitCode = await runBrowserLane(['.browser.test.ts'], {
    chromeTmpdir: '/scratch/chrome/4417',
    createDir: () => Promise.resolve(),
    env: {},
    removeDir,
    removeExitedProcessDirs: () => Promise.resolve(),
    run: {
      runID: '4417',
      runsDir: '/scratch/runs',
      runDir: '/scratch/runs/4417',
      webDir: '/scratch/runs/4417/web',
      webServerPath: '/scratch/runs/4417/web/server/server.js',
      normalizeImagePath: '/scratch/runs/4417/normalize-image.js',
      profilesDir: '/scratch/runs/4417/profiles',
    },
    runBuilds: () => Promise.resolve(),
    runTests: () => Promise.resolve(1),
  });

  expect(exitCode).toBe(1);

  expect(removeDir.mock.calls).toIncludeSameMembers([
    ['/scratch/runs/4417'],
    ['/scratch/chrome/4417'],
  ]);
});

test("it gives the tests the run's ID and the Chrome temp folder", async () => {
  const runTests = mock(() => Promise.resolve(0));

  await runBrowserLane(['.browser.test.ts'], {
    chromeTmpdir: '/scratch/chrome/4417',
    createDir: () => Promise.resolve(),
    env: { PATH: '/usr/bin' },
    removeDir: () => Promise.resolve(),
    removeExitedProcessDirs: () => Promise.resolve(),
    run: {
      runID: '4417',
      runsDir: '/scratch/runs',
      runDir: '/scratch/runs/4417',
      webDir: '/scratch/runs/4417/web',
      webServerPath: '/scratch/runs/4417/web/server/server.js',
      normalizeImagePath: '/scratch/runs/4417/normalize-image.js',
      profilesDir: '/scratch/runs/4417/profiles',
    },
    runBuilds: () => Promise.resolve(),
    runTests,
  });

  expect(runTests).toHaveBeenCalledExactlyOnceWith(['.browser.test.ts'], {
    NIXIE_BROWSER_RUN_ID: '4417',
    PATH: '/usr/bin',
    TMPDIR: '/scratch/chrome/4417',
  });
});

test('it starts the tests only once the build finishes', async () => {
  const build = buildStubPendingStep();
  const runTests = mock(() => Promise.resolve(0));

  const lane = runBrowserLane(['.browser.test.ts'], {
    chromeTmpdir: '/scratch/chrome/4417',
    createDir: () => Promise.resolve(),
    env: {},
    removeDir: () => Promise.resolve(),
    removeExitedProcessDirs: () => Promise.resolve(),
    run: {
      runID: '4417',
      runsDir: '/scratch/runs',
      runDir: '/scratch/runs/4417',
      webDir: '/scratch/runs/4417/web',
      webServerPath: '/scratch/runs/4417/web/server/server.js',
      normalizeImagePath: '/scratch/runs/4417/normalize-image.js',
      profilesDir: '/scratch/runs/4417/profiles',
    },
    runBuilds: build.run,
    runTests,
  });

  await build.started;

  const testRunsDuringBuild = runTests.mock.calls.length;

  build.finish();

  await lane;

  expect(testRunsDuringBuild).toBe(0);
  expect(runTests).toHaveBeenCalledOnce();
});
