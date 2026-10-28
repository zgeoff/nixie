import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { BrowserRun } from './build-browser-run';
import { buildBrowserRun } from './build-browser-run';
import { pickChromeTmpdir } from './pick-chrome-tmpdir';
import { removeExitedProcessDirs } from './remove-exited-process-dirs';

type Env = Readonly<Record<string, string | undefined>>;

interface BrowserLaneOptions {
  readonly run: BrowserRun;

  readonly chromeTmpdir: string;

  readonly signal: AbortSignal;

  readonly runBuilds: (run: BrowserRun, signal: AbortSignal) => Promise<number>;

  readonly runTests: (
    testArgs: readonly string[],
    env: Env,
    signal: AbortSignal,
  ) => Promise<number>;
}

// `bun test --parallel=1` isolates each file, so the preload runs again for each one, and the
// builds and the run ID come from here, once per run. Bun starts Chrome with the environment the
// test process started with, so Chrome's TMPDIR is set here too.
export async function runBrowserLane(
  testArgs: readonly string[],
  options: BrowserLaneOptions,
): Promise<number> {
  const run = options.run;
  const chromeTmpdir = options.chromeTmpdir;

  await Promise.all([
    removeExitedProcessDirs(run.runsDir),
    removeExitedProcessDirs(dirname(chromeTmpdir)),
  ]);

  try {
    await createDirs([run.profilesDir, chromeTmpdir]);

    const buildExitCode = await options.runBuilds(run, options.signal);

    if (options.signal.aborted) {
      return 1;
    }

    if (buildExitCode !== 0) {
      return buildExitCode;
    }

    return await options.runTests(
      testArgs,
      { ...process.env, NIXIE_BROWSER_RUN_ID: run.runID, TMPDIR: chromeTmpdir },
      options.signal,
    );
  } finally {
    await removeDirs([run.runDir, chromeTmpdir]);
  }
}

// A failed mkdir rejects Promise.all while the other still runs, and that one would make its
// folder again after the cleanup, so the lane waits for both.
async function createDirs(paths: readonly string[]): Promise<void> {
  const created = await Promise.allSettled(paths.map((path) => mkdir(path, { recursive: true })));

  const failure = created.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );

  if (failure !== undefined) {
    throw new Error('the browser lane could not create its folders', { cause: failure.reason });
  }
}

// A throw from the cleanup would hide the lane's own error, so a removal that fails is logged.
async function removeDirs(paths: readonly string[]): Promise<void> {
  const removed = await Promise.allSettled(
    paths.map((path) => rm(path, { recursive: true, force: true })),
  );

  for (const result of removed) {
    if (result.status === 'rejected') {
      console.error('the browser lane could not remove a folder:', result.reason);
    }
  }
}

const webDir = join(import.meta.dir, '..', '..');

async function runBuilds(run: BrowserRun, signal: AbortSignal): Promise<number> {
  const child = Bun.spawn(['bun', 'run', 'build', '--outDir', run.webDir], {
    cwd: webDir,
    signal,
    stderr: 'inherit',
    stdout: 'inherit',
  });

  const exitCode = await child.exited;

  if (exitCode !== 0 || signal.aborted) {
    return exitCode;
  }

  await Bun.build({
    entrypoints: [join(webDir, 'src', 'normalize-image.ts')],
    format: 'esm',
    naming: 'normalize-image.js',
    outdir: dirname(run.normalizeImagePath),
    target: 'browser',
  });

  return 0;
}

function runTests(testArgs: readonly string[], env: Env, signal: AbortSignal): Promise<number> {
  const child = Bun.spawn([process.execPath, 'test', ...testArgs], {
    env,
    signal,
    stderr: 'inherit',
    stdin: 'inherit',
    stdout: 'inherit',
  });

  return child.exited;
}

if (import.meta.main) {
  const run = buildBrowserRun(String(process.pid));

  // The memory cap script stops the lane with a signal. The abort stops the build or the test
  // process, and the lane waits for it to exit before it removes its folders.
  const controller = new AbortController();

  const handleSignal = () => {
    controller.abort();
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  process.exitCode = await runBrowserLane(process.argv.slice(2), {
    chromeTmpdir: pickChromeTmpdir(tmpdir(), run.runID),
    run,
    runBuilds,
    runTests,
    signal: controller.signal,
  });
}
