import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import type {
  CollectFilesOptions,
  FileSpec,
  GuestHome,
  ProcessIO,
  RunSpec,
  Sandbox,
  SandboxRecorder,
  SandboxSpec,
  ToolTargetResolver,
} from '@heynixie/sandbox';
import { mergeExecEnv, runCommand, startExecStream } from '@heynixie/sandbox';
import type { ProcessState } from './build-process-state';
import { resolveGuestPath } from './resolve-guest-path';
import { startProcessGroup } from './start-process-group';

export interface ProcessSandboxContext {
  readonly recorder: SandboxRecorder;
  readonly toolTarget: ToolTargetResolver;
  readonly killGraceMs: number;

  // the host's broker variables, which only a guest with a grant gets, as imp sets them only in an
  // imp with a grant
  readonly brokerEnv: Readonly<Record<string, string>>;
  readonly id: string;
  readonly spec: SandboxSpec;

  // the sandbox's own directory, which stands in for the guest's filesystem
  readonly fsRoot: string;
  readonly state: ProcessState;
  readonly remove: () => Promise<void>;
}

// Builds the handle for one sandbox of the double.
export function buildProcessSandbox(ctx: ProcessSandboxContext): Sandbox {
  return {
    id: ctx.id,
    spec: ctx.spec,
    exec: (command, signal) => {
      const io = tryStartGuestProcess(ctx, command);

      return io instanceof Error ? Promise.reject(io) : runCommand(io, command.stdin, signal);
    },
    spawn: (command) => {
      const io = tryStartGuestProcess(ctx, command);

      return io instanceof Error
        ? Promise.reject(io)
        : Promise.resolve(startExecStream(io, command.maxMessageBytes));
    },
    copyIn: (files) => writeGuestFiles(ctx.fsRoot, files),
    copyOut: (paths) => Promise.all(paths.map((path) => readGuestFile(ctx.fsRoot, path))),
    resolveHome: (env) => Promise.try(() => resolveGuestHome(ctx.fsRoot, env)),
    collectFiles: (dir, options) => collectGuestFiles(ctx.fsRoot, dir, options),
    applyMove: (from, to) => applyGuestMove(ctx.fsRoot, from, to),
    toolRoute: async () => {
      if (!ctx.spec.toolRoute) {
        return null;
      }

      const port = await ctx.state.openRelay(ctx.toolTarget({ id: ctx.id, owner: ctx.spec.owner }));

      return { url: `http://127.0.0.1:${port}` };
    },
    suspension: {
      kind: 'memory',
      sleep: async () => {
        ctx.state.sleep();

        await ctx.recorder.write({ event: 'slept', sandboxID: ctx.id });
      },
      wake: async () => {
        ctx.state.wake();

        await ctx.recorder.write({ event: 'woken', sandboxID: ctx.id });
      },
    },
    destroy: async () => {
      await ctx.remove();
      await ctx.recorder.write({ event: 'destroyed', sandboxID: ctx.id, reason: 'destroyed' });
    },
    isRetired: false,
  };
}

// imp wakes a sleeping imp for an exec; the double refuses one instead, so a test that forgets a
// wake fails rather than hangs
function tryStartGuestProcess(ctx: ProcessSandboxContext, command: RunSpec): ProcessIO | Error {
  if (ctx.state.isAsleep()) {
    return new Error(`sandbox ${ctx.id} is asleep`);
  }

  const env = ctx.spec.grants.length === 0 ? command.env : { ...ctx.brokerEnv, ...command.env };

  const group = startProcessGroup({
    argv: command.argv,
    cwd: resolveGuestPath(ctx.fsRoot, command.cwd ?? '/'),
    env: {
      PATH: process.env['PATH'] ?? '/usr/bin:/bin',
      HOME: ctx.fsRoot,
      ...mergeExecEnv(ctx.spec, env),
    },
    killGraceMs: ctx.killGraceMs,
  });

  ctx.state.track(group);

  return group;
}

async function writeGuestFiles(fsRoot: string, files: readonly FileSpec[]): Promise<void> {
  for (const file of files) {
    const path = resolveGuestPath(fsRoot, file.path);

    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.content);
  }
}

async function readGuestFile(fsRoot: string, path: string): Promise<FileSpec> {
  const content = await readFile(resolveGuestPath(fsRoot, path));

  return { path, content: new Uint8Array(content) };
}

// The guest's processes start with HOME at the sandbox's own directory unless the command's env
// sets it, and the guest's root is that directory, so the copy path is the home below it.
function resolveGuestHome(fsRoot: string, env: Readonly<Record<string, string>>): GuestHome {
  const home = env['HOME'] ?? fsRoot;
  const below = relative(fsRoot, home);

  if (!isAbsolute(home) || below === '..' || below.startsWith(`..${sep}`)) {
    throw new Error(`HOME ${home} is outside the guest root ${fsRoot}`);
  }

  return { copyPath: join('/', below), ownPath: home };
}

async function collectGuestFiles(
  fsRoot: string,
  dir: string,
  options: CollectFilesOptions = {},
): Promise<readonly string[]> {
  const root = resolveGuestPath(fsRoot, dir);

  try {
    return await collectFilesBelow(root, options.maxDepth ?? Number.POSITIVE_INFINITY);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

// a walk that reads one folder level per step, so a bounded depth reads no folder below it
async function collectFilesBelow(dir: string, depth: number): Promise<readonly string[]> {
  if (depth < 1) {
    return [];
  }

  const entries = await readdir(dir, { withFileTypes: true });

  const listed = await Promise.all(
    entries.map(async (entry) => {
      if (entry.isDirectory()) {
        const below = await collectFilesBelow(join(dir, entry.name), depth - 1);

        return below.map((path) => join(entry.name, path));
      }

      return entry.isFile() ? [entry.name] : [];
    }),
  );

  return listed.flat();
}

// a rename, which replaces a file at the target in one step
async function applyGuestMove(fsRoot: string, from: string, to: string): Promise<void> {
  await rename(resolveGuestPath(fsRoot, from), resolveGuestPath(fsRoot, to));
}
