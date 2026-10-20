import type {
  ExecResult,
  ExecSpec,
  FileSpec,
  GuestHome,
  ReadFilePathsOptions,
  Sandbox,
  SandboxRecorder,
  SandboxSpec,
} from '@heynixie/sandbox';
import { collectOutput, runCommand, startExecStream } from '@heynixie/sandbox';
import type { RouteRegistry } from './build-route-registry';
import { toProcessIO } from './to-process-io';
import type { ImpPort } from './types';

export interface ImpSandboxContext {
  readonly port: ImpPort;
  readonly recorder: SandboxRecorder;
  readonly routes: RouteRegistry;
  readonly guestToolPort: number;
  readonly killGraceMs: number;
  readonly id: string;
  readonly spec: SandboxSpec;

  // impd still backs the imp up, so its owner replaces it
  readonly isRetired: boolean;

  // whether the adapter last put this imp to sleep, so a later call records the wake it causes
  readonly sleeping: SleepRegistry;
}

export interface SleepRegistry {
  readonly isAsleep: (id: string) => boolean;
  readonly setAsleep: (id: string, isAsleep: boolean) => void;
}

// Builds the handle for one imp. Every exec opens the tool route first when it has closed, so the
// route stands again after a sleep that impd took on its own.
export function buildImpSandbox(ctx: ImpSandboxContext): Sandbox {
  return {
    id: ctx.id,
    spec: ctx.spec,
    exec: async (command, signal) => {
      const io = await startImpProcess(ctx, command);

      return runCommand(io, command.stdin, signal);
    },
    spawn: async (command) => {
      const io = await startImpProcess(ctx, command);

      return startExecStream(io, command.maxMessageBytes);
    },
    copyIn: (files) => writeGuestFiles(ctx, files),
    copyOut: (paths) => Promise.all(paths.map((path) => readGuestFile(ctx, path))),
    resolveHome: (env) => Promise.try(() => resolveGuestHome(env)),
    readFilePaths: (directory, options) => readGuestFilePaths(ctx, directory, options),
    applyMove: (from, to) => applyGuestMove(ctx, from, to),
    toolRoute: async () => {
      await startRoute(ctx);

      return ctx.spec.toolRoute ? { url: `http://127.0.0.1:${ctx.guestToolPort}` } : null;
    },
    suspension: buildSuspension(ctx),
    destroy: async () => {
      await ctx.routes.close(ctx.id);
      await ctx.port.removeImp(ctx.id);
      await ctx.recorder.write({ event: 'destroyed', sandboxID: ctx.id, reason: 'destroyed' });
    },
    isRetired: ctx.isRetired,
  };
}

async function startImpProcess(ctx: ImpSandboxContext, command: ExecSpec) {
  await startRoute(ctx);

  const exec = await ctx.port.openExec(ctx.id, command.argv, {
    env: buildImpExecEnv(ctx.spec, command.env),
    ...(command.cwd === undefined ? {} : { cwd: command.cwd }),
    killGraceMs: ctx.killGraceMs,
    requireBroker: ctx.spec.grants.length > 0,
  });

  // an idle sleep that impd starts between the route's open and the exec's arrival holds the exec
  // until it wakes the imp, and ends the forward meanwhile, so the forward listens again once the
  // exec has started, which imp's client reports after it returns the handle
  try {
    await exec.started;

    await ctx.routes.open(ctx.id, ctx.spec);
  } catch (error) {
    exec.close();
    throw error;
  }

  return toProcessIO(exec, ctx.killGraceMs);
}

// Each grant's placeholders, then the command's own variables. impd sets the broker's variables for
// an imp with a grant, NO_PROXY with the loopback among them, and refuses an exec whose env
// replaces one, so the adapter adds no NO_PROXY of its own. An imp with no grant has no proxy.
function buildImpExecEnv(
  spec: SandboxSpec,
  env: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> {
  const merged: Record<string, string> = {};

  for (const grant of spec.grants) {
    Object.assign(merged, grant.env);
  }

  return { ...merged, ...env };
}

// A call on an imp the adapter put to sleep wakes it first and records the wake. impd holds an imp
// through an idle sleep and ends its forward only after the snapshot, so the wake waits that out and
// the forward listens again on the woken imp before the guest connects.
async function startRoute(ctx: ImpSandboxContext): Promise<void> {
  if (ctx.sleeping.isAsleep(ctx.id)) {
    await updateImpAwake(ctx);
  } else if (ctx.spec.toolRoute) {
    await ctx.port.wakeImp(ctx.id);
  }

  await ctx.routes.open(ctx.id, ctx.spec);
}

async function updateImpAwake(ctx: ImpSandboxContext): Promise<void> {
  await ctx.port.wakeImp(ctx.id);

  ctx.sleeping.setAsleep(ctx.id, false);

  await ctx.recorder.write({ event: 'woken', sandboxID: ctx.id });
}

// A sleep ends the forward in the imp, so the adapter closes its side first, and opens it again
// after the wake.
function buildSuspension(ctx: ImpSandboxContext): Sandbox['suspension'] {
  return {
    kind: 'memory',
    sleep: async () => {
      ctx.sleeping.setAsleep(ctx.id, true);

      await ctx.routes.close(ctx.id);
      await ctx.port.sleepImp(ctx.id);
      await ctx.recorder.write({ event: 'slept', sandboxID: ctx.id });
    },
    wake: async () => {
      await updateImpAwake(ctx);

      await ctx.routes.open(ctx.id, ctx.spec);
    },
  };
}

async function writeGuestFiles(ctx: ImpSandboxContext, files: readonly FileSpec[]): Promise<void> {
  for (const file of files) {
    requireGuestPath(file.path);

    const io = await startImpProcess(ctx, {
      argv: ['sh', '-c', 'mkdir -p "$(dirname "$1")" && cat > "$1"', 'sh', file.path],
    });

    const result = await runCommand(io, file.content, undefined);

    requireSuccess(result, `copy into ${file.path}`);
  }
}

// the largest file copyOut brings onto the host, so a guest cannot fill the host's memory
const copyOutLimitBytes = 64 * 1024 * 1024;

async function readGuestFile(ctx: ImpSandboxContext, path: string): Promise<FileSpec> {
  requireGuestPath(path);

  // the guest sends at most one byte past the limit, which shows the cut
  const io = await startImpProcess(ctx, {
    argv: ['head', '-c', String(copyOutLimitBytes + 1), '--', path],
  });

  const [content, result] = await Promise.all([
    collectOutput(io.stdout, copyOutLimitBytes),
    runCommand({ ...io, stdout: new Blob().stream() }, undefined, undefined),
  ]);

  requireSuccess(result, `copy out of ${path}`);

  if (content.isCut) {
    throw new Error(`copy out of ${path} failed: the file passes ${copyOutLimitBytes} bytes`);
  }

  return { path, content: content.bytes };
}

// The imp's root is the guest's own, so both forms of the home are the HOME the command runs with,
// which the guest command always sets, since the imp's default lies in the image.
function resolveGuestHome(env: Readonly<Record<string, string>>): GuestHome {
  const home = env['HOME'];

  if (home === undefined) {
    throw new Error('the guest command sets no HOME');
  }

  requireGuestPath(home);

  return { copyPath: home, ownPath: home };
}

// a missing directory lists nothing; the arguments after the directory bound find's depth, and find
// separates the paths with NUL, which no path holds
const listScript = '[ -d "$1" ] || exit 0; cd -- "$1" && shift && find . "$@" -type f -print0';

// The list comes back through the output cap, which guards against a guest that prints without end,
// so a caller that needs only the top of a tree bounds the depth, and deeper files never fill it.
async function readGuestFilePaths(
  ctx: ImpSandboxContext,
  directory: string,
  options: ReadFilePathsOptions = {},
): Promise<readonly string[]> {
  requireGuestPath(directory);

  const depth = options.maxDepth === undefined ? [] : ['-maxdepth', String(options.maxDepth)];

  const io = await startImpProcess(ctx, {
    argv: ['sh', '-c', listScript, 'sh', directory, ...depth],
  });

  const result = await runCommand(io, undefined, undefined);

  requireSuccess(result, `listing ${directory}`);

  if (result.stdout.isCut) {
    throw new Error(
      `listing ${directory} failed: the list passes ${result.stdout.bytes.length} bytes`,
    );
  }

  return new TextDecoder()
    .decode(result.stdout.bytes)
    .split('\0')
    .filter((path) => path !== '')
    .map((path) => path.slice('./'.length));
}

// mv renames within the imp's filesystem, which replaces a file at the target in one step
async function applyGuestMove(ctx: ImpSandboxContext, from: string, to: string): Promise<void> {
  requireGuestPath(from);
  requireGuestPath(to);

  const io = await startImpProcess(ctx, { argv: ['mv', '-f', '-T', '--', from, to] });
  const result = await runCommand(io, undefined, undefined);

  requireSuccess(result, `move of ${from} to ${to}`);
}

function requireGuestPath(path: string): void {
  if (!path.startsWith('/') || path.split('/').includes('..')) {
    throw new Error(`a guest path must be absolute and must not climb: ${path}`);
  }
}

function requireSuccess(result: ExecResult, action: string): void {
  if (result.code !== 0) {
    const stderr = new TextDecoder().decode(result.stderr.bytes);

    throw new Error(`${action} failed with ${result.signal ?? String(result.code)}: ${stderr}`);
  }
}
