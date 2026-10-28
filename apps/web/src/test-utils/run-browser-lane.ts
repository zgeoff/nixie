import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { BrowserRun } from './build-browser-run';
import { buildBrowserRun } from './build-browser-run';
import { pickChromeTmpdir } from './pick-chrome-tmpdir';
import { removeExitedProcessDirs } from './remove-exited-process-dirs';

interface BrowserLaneDependencies {
  readonly run: BrowserRun;

  readonly chromeTmpdir: string;

  readonly runBuilds: (run: BrowserRun) => Promise<void>;

  readonly runTests: (
    testArgs: readonly string[],
    env: Readonly<Record<string, string | undefined>>,
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
    removeExitedProcessDirs(run.runsDir),
    removeExitedProcessDirs(dirname(chromeTmpdir)),
  ]);

  try {
    await Promise.all([
      mkdir(run.profilesDir, { recursive: true }),
      mkdir(chromeTmpdir, { recursive: true }),
    ]);

    await dependencies.runBuilds(run);

    return await dependencies.runTests(testArgs, {
      ...process.env,
      NIXIE_BROWSER_RUN_ID: run.runID,
      TMPDIR: chromeTmpdir,
    });
  } finally {
    await Promise.all([
      rm(run.runDir, { recursive: true, force: true }),
      rm(chromeTmpdir, { recursive: true, force: true }),
    ]);
  }
}

const webDir = join(import.meta.dir, '..', '..');

async function runBuilds(run: BrowserRun): Promise<void> {
  const child = Bun.spawn(['bun', 'run', 'build', '--outDir', run.webDir], {
    cwd: webDir,
    stderr: 'inherit',
    stdout: 'inherit',
  });

  const exitCode = await child.exited;

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

async function runTests(
  testArgs: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): Promise<number> {
  const child = Bun.spawn([process.execPath, 'test', ...testArgs], {
    env,
    stderr: 'inherit',
    stdin: 'inherit',
    stdout: 'inherit',
  });

  // The memory cap script stops the lane with a signal, and the test process takes it on, so the
  // lane still removes its folders.
  const handleSignal = (signal: NodeJS.Signals) => {
    child.kill(signal);
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  try {
    return await child.exited;
  } finally {
    process.off('SIGINT', handleSignal);
    process.off('SIGTERM', handleSignal);
  }
}

if (import.meta.main) {
  const run = buildBrowserRun(String(process.pid));

  process.exitCode = await runBrowserLane(process.argv.slice(2), {
    chromeTmpdir: pickChromeTmpdir(tmpdir(), run.runID),
    run,
    runBuilds,
    runTests,
  });
}
