import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import type { ProcessState } from './build-process-state';
import { memoryKillsPath } from './memory-kills-path';
import { mergeExecEnv } from './merge-exec-env';
import { parseMemoryKillsFile } from './parse-memory-kills-file';
import { resolveGuestPath } from './resolve-guest-path';
import { runCommand } from './run-command';
import type { ProcessIO } from './start-exec-stream';
import { startExecStream } from './start-exec-stream';
import { startProcessGroup } from './start-process-group';
import type {
  FileSpec,
  GuestHome,
  MemoryKillRead,
  ReadFilePathsOptions,
  RunSpec,
  Sandbox,
  SandboxRecorder,
  SandboxSpec,
  ToolTargetResolver,
} from './types';

export interface ProcessSandboxContext {
  readonly recorder: SandboxRecorder;
  readonly toolTarget: ToolTargetResolver;
  readonly killGraceMs: number;

  readonly brokerEnv: Readonly<Record<string, string>>;
  readonly id: string;
  readonly spec: SandboxSpec;

  readonly fsRoot: string;

  readonly aliasFsRoot: string;
  readonly state: ProcessState;
  readonly remove: () => Promise<void>;
}

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
    resolveHome: (env) => Promise.try(() => resolveGuestHome(ctx, env)),
    readFilePaths: (directory, options) => readGuestFilePaths(ctx.fsRoot, directory, options),
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
    readMemoryKills: (signal) => readGuestMemoryKills(ctx.fsRoot, signal),
    destroy: async () => {
      await ctx.remove();
      await ctx.recorder.write({ event: 'destroyed', sandboxID: ctx.id, reason: 'destroyed' });
    },
    isRetired: false,
  };
}

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

function resolveGuestHome(
  ctx: Pick<ProcessSandboxContext, 'fsRoot' | 'aliasFsRoot'>,
  env: Readonly<Record<string, string>>,
): GuestHome {
  const given = env['HOME'] ?? ctx.fsRoot;

  if (!isAbsolute(given)) {
    throw new Error(`HOME ${given} is outside the guest root ${ctx.fsRoot}`);
  }

  const aliasBelow = findPathBelow(ctx.aliasFsRoot, given);
  const home = aliasBelow === null ? given : join(ctx.fsRoot, aliasBelow);
  const below = findPathBelow(ctx.fsRoot, home);

  if (below === null) {
    throw new Error(`HOME ${given} is outside the guest root ${ctx.fsRoot}`);
  }

  return { copyPath: join('/', below), ownPath: home };
}

function findPathBelow(directory: string, path: string): string | null {
  const below = relative(directory, path);

  return below === '..' || below.startsWith(`..${sep}`) || isAbsolute(below) ? null : below;
}

function readGuestFilePaths(
  fsRoot: string,
  directory: string,
  options: ReadFilePathsOptions = {},
): Promise<readonly string[]> {
  const root = resolveGuestPath(fsRoot, directory);

  return readFilePathsBelow(root, options.maxDepth ?? Number.POSITIVE_INFINITY);
}

async function readFilePathsBelow(directory: string, depth: number): Promise<readonly string[]> {
  if (depth < 1) {
    return [];
  }

  const entries = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }

    throw error;
  });

  const listed = await Promise.all(
    entries.map(async (entry) => {
      if (entry.isDirectory()) {
        const below = await readFilePathsBelow(join(directory, entry.name), depth - 1);

        return below.map((path) => join(entry.name, path));
      }

      return entry.isFile() ? [entry.name] : [];
    }),
  );

  return listed.flat();
}

async function applyGuestMove(fsRoot: string, from: string, to: string): Promise<void> {
  await rename(resolveGuestPath(fsRoot, from), resolveGuestPath(fsRoot, to));
}

async function readGuestMemoryKills(
  fsRoot: string,
  signal: AbortSignal | undefined,
): Promise<MemoryKillRead> {
  if (signal?.aborted === true) {
    return { kind: 'failed' };
  }

  try {
    await stat(fsRoot);
  } catch {
    return { kind: 'failed' };
  }

  try {
    const text = await readFile(resolveGuestPath(fsRoot, memoryKillsPath), 'utf8');

    return parseMemoryKillsFile(text);
  } catch (error) {
    const isMissing = error instanceof Error && 'code' in error && error.code === 'ENOENT';

    return isMissing ? { kind: 'count', kills: 0 } : { kind: 'failed' };
  }
}
