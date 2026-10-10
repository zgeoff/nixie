import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type {
  FileSpec,
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
  };
}

// imp wakes a sleeping imp for an exec; the double refuses one instead, so a test that forgets a
// wake fails rather than hangs
function tryStartGuestProcess(ctx: ProcessSandboxContext, command: RunSpec): ProcessIO | Error {
  if (ctx.state.isAsleep()) {
    return new Error(`sandbox ${ctx.id} is asleep`);
  }
  const group = startProcessGroup({
    argv: command.argv,
    cwd: resolveGuestPath(ctx.fsRoot, command.cwd ?? '/'),
    env: {
      PATH: process.env['PATH'] ?? '/usr/bin:/bin',
      HOME: ctx.fsRoot,
      ...mergeExecEnv(ctx.spec, command.env),
    },
    killGraceMs: ctx.killGraceMs,
  });

  ctx.state.track(group);
  return group;
}

async function writeGuestFiles(fsRoot: string, files: readonly FileSpec[]): Promise<void> {
  for (const file of files) {
    const path = resolveGuestPath(fsRoot, file.path);

    // oxlint-disable-next-line no-await-in-loop -- writes in order, so a later file wins
    await mkdir(dirname(path), { recursive: true });

    // oxlint-disable-next-line no-await-in-loop -- writes in order, so a later file wins
    await writeFile(path, file.content);
  }
}

async function readGuestFile(fsRoot: string, path: string): Promise<FileSpec> {
  const content = await readFile(resolveGuestPath(fsRoot, path));

  return { path, content: new Uint8Array(content) };
}
