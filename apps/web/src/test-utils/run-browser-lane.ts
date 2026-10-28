import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { BrowserRun } from './build-browser-run';
import { buildBrowserRun } from './build-browser-run';
import { pickChromeTmpdir } from './pick-chrome-tmpdir';
import { removeExitedProcessDirs } from './remove-exited-process-dirs';

type Env = Readonly<Record<string, string | undefined>>;

interface BrowserLaneDependencies {
  readonly run: BrowserRun;

  readonly chromeTmpdir: string;

  readonly env: Env;

  readonly signal: AbortSignal;

  readonly createDir: (path: string) => Promise<void>;

  readonly removeDir: (path: string) => Promise<void>;

  readonly removeExitedProcessDirs: (parentDir: string) => Promise<void>;

  readonly runBuilds: (run: BrowserRun, signal: AbortSignal) => Promise<void>;

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
  dependencies: BrowserLaneDependencies,
): Promise<number> {
  const run = dependencies.run;
  const chromeTmpdir = dependencies.chromeTmpdir;

  await Promise.all([
    dependencies.removeExitedProcessDirs(run.runsDir),
    dependencies.removeExitedProcessDirs(dirname(chromeTmpdir)),
  ]);

  try {
    await Promise.all([
      dependencies.createDir(run.profilesDir),
      dependencies.createDir(chromeTmpdir),
    ]);

    await dependencies.runBuilds(run, dependencies.signal);

    if (dependencies.signal.aborted) {
      return 1;
    }

    return await dependencies.runTests(
      testArgs,
      { ...dependencies.env, NIXIE_BROWSER_RUN_ID: run.runID, TMPDIR: chromeTmpdir },
      dependencies.signal,
    );
  } finally {
    await Promise.all([dependencies.removeDir(run.runDir), dependencies.removeDir(chromeTmpdir)]);
  }
}

const webDir = join(import.meta.dir, '..', '..');

async function runBuilds(run: BrowserRun, signal: AbortSignal): Promise<void> {
  const child = Bun.spawn(['bun', 'run', 'build', '--outDir', run.webDir], {
    cwd: webDir,
    signal,
    stderr: 'inherit',
    stdout: 'inherit',
  });

  const exitCode = await child.exited;

  if (signal.aborted) {
    return;
  }

  if (exitCode !== 0) {
    throw new Error(`the web build failed with exit code ${exitCode}`);
  }

  await Bun.build({
    entrypoints: [join(webDir, 'src', 'normalize-image.ts')],
    format: 'esm',
    naming: 'normalize-image.js',
    outdir: dirname(run.normalizeImagePath),
    target: 'browser',
  });
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
    createDir: async (path) => {
      await mkdir(path, { recursive: true });
    },
    env: process.env,
    removeDir: (path) => rm(path, { recursive: true, force: true }),
    removeExitedProcessDirs,
    run,
    runBuilds,
    runTests,
    signal: controller.signal,
  });
}
