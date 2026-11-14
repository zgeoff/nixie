import type { Clock } from '@heynixie/clock';
import type { ExecResult, MemoryKillRead, Sandbox } from '@heynixie/sandbox';
import type { CodeRunInput } from './code-run-input';
import { codeRunLimits } from './code-run-limits';
import type { OutFile } from './collect-out-listing';
import { collectOutListing, isFilesLimitPassed } from './collect-out-listing';
import type { ResolvedInputs } from './resolve-code-run-inputs';
import { skillsDirectory, workDirectory } from './resolve-code-run-inputs';

export interface ProgramRun {
  readonly exit: ExecResult;

  // nixie stopped the program at its wall time
  readonly didStop: boolean;
  readonly before: MemoryKillRead;
  readonly after: MemoryKillRead;

  // every regular file under out/, in path order, and whether the listing hit the exec cap
  readonly listed: readonly OutFile[];
  readonly isListingCut: boolean;

  // the bytes of each listed file in listing order, or none when out/ passed a files limit
  readonly copied: readonly Uint8Array<ArrayBuffer>[];
}

export interface ProgramTarget {
  readonly sandbox: Sandbox;
  readonly clock: Clock;
  readonly input: CodeRunInput;
  readonly inputs: ResolvedInputs;

  // aborting it stops the program, and the call's own timeout aborts it too
  readonly stop: AbortController;
}

const programDirectory = '/opt/nixie';

const languageCommands = {
  python: { argv: ['python3'], file: 'main.py' },
  javascript: { argv: ['bun'], file: 'main.js' },
  typescript: { argv: ['bun'], file: 'main.ts' },
  bash: { argv: ['bash'], file: 'main.sh' },
} as const satisfies Record<
  CodeRunInput['language'],
  { readonly argv: readonly string[]; readonly file: string }
>;

// Copies the inputs in, runs the program as code in the work folder, lists out/ and copies the
// files out, unless out/ passes a files limit.
export async function runCodeProgram(target: ProgramTarget): Promise<ProgramRun> {
  const command = languageCommands[target.input.language];
  const programPath = `${programDirectory}/${command.file}`;

  await target.sandbox.copyIn([
    ...target.inputs.files,
    ...target.inputs.skillFiles,
    { path: programPath, content: new TextEncoder().encode(target.input.program) },
  ]);

  await requireSetup(target.sandbox);

  const before = await target.sandbox.readMemoryKills();
  const ran = await runProgramWithinWallTime(target, [...command.argv, programPath]);
  const after = await target.sandbox.readMemoryKills();

  const listing = await target.sandbox.exec({
    argv: ['find', `${workDirectory}/out`, '-type', 'f', '-printf', String.raw`%s %P\0`],
  });

  const listed = collectOutListing(listing.stdout.bytes);
  const isListingCut = listing.stdout.isCut;
  const isPassed = isFilesLimitPassed(listed, isListingCut);
  const copied = isPassed ? [] : await copyOutFiles(target.sandbox, listed);

  return { exit: ran.exit, didStop: ran.didStop, before, after, listed, isListingCut, copied };
}

// The /work folder belongs to code, and /skills belongs to root and is read-only to code.
async function requireSetup(sandbox: Sandbox): Promise<void> {
  const setup = await sandbox.exec({
    argv: [
      'sh',
      '-c',
      `mkdir -p ${workDirectory}/out && chown -R code:code ${workDirectory} && ` +
        `chown -R root:root ${skillsDirectory} && chmod -R go-w,a+rX ${skillsDirectory}`,
    ],
  });

  if (setup.code !== 0) {
    throw new Error(`the sandbox setup exited with ${setup.code ?? setup.signal ?? 'no code'}`);
  }
}

// The program runs as the user code, which the image holds, and never as root.
const codeRunWrapper = ['setpriv', '--reuid=code', '--regid=code', '--clear-groups', '--'] as const;

const programEnv = {
  PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  HOME: '/home/code',
  LANG: 'C.UTF-8',
  MPLBACKEND: 'Agg',
  MPLCONFIGDIR: '/tmp/matplotlib',
  PYTHONDONTWRITEBYTECODE: '1',
};

interface WallTimeState {
  didStop: boolean;
}

async function runProgramWithinWallTime(
  target: ProgramTarget,
  argv: readonly string[],
): Promise<{ readonly exit: ExecResult; readonly didStop: boolean }> {
  const timer = new AbortController();

  const state: WallTimeState = { didStop: false };

  void stopAtWallTime(target, timer.signal, state);

  try {
    const exit = await target.sandbox.exec(
      { argv: [...codeRunWrapper, ...argv], cwd: workDirectory, env: programEnv },
      target.stop.signal,
    );

    return { exit, didStop: state.didStop };
  } finally {
    timer.abort();
  }
}

async function stopAtWallTime(
  target: ProgramTarget,
  timer: AbortSignal,
  state: WallTimeState,
): Promise<void> {
  await target.clock.sleep(codeRunLimits.wallTimeMs, timer);

  if (!timer.aborted) {
    state.didStop = true;

    target.stop.abort();
  }
}

async function copyOutFiles(
  sandbox: Sandbox,
  listed: readonly OutFile[],
): Promise<readonly Uint8Array<ArrayBuffer>[]> {
  if (listed.length === 0) {
    return [];
  }

  const files = await sandbox.copyOut(listed.map((file) => `${workDirectory}/${file.path}`));

  return files.map((file) => file.content);
}
