import type {
  ExecResult,
  ExecSpec,
  FileSpec,
  Sandbox,
  SandboxRecorder,
  SandboxSpec,
} from '@heynixie/sandbox';
import { mergeExecEnv, runCommand, startExecStream } from '@heynixie/sandbox';
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
    toolRoute: async () => {
      await ctx.routes.open(ctx.id, ctx.spec);
      return ctx.spec.toolRoute ? { url: `http://127.0.0.1:${ctx.guestToolPort}` } : null;
    },
    suspension: buildSuspension(ctx),
    destroy: async () => {
      await ctx.routes.close(ctx.id);
      await ctx.port.removeImp(ctx.id);
      await ctx.recorder.write({ event: 'destroyed', sandboxID: ctx.id, reason: 'destroyed' });
    },
  };
}

async function startImpProcess(ctx: ImpSandboxContext, command: ExecSpec) {
  await ctx.routes.open(ctx.id, ctx.spec);

  const exec = await ctx.port.openExec(ctx.id, command.argv, {
    env: mergeExecEnv(ctx.spec, command.env),
    ...(command.cwd === undefined ? {} : { cwd: command.cwd }),
    killGraceMs: ctx.killGraceMs,
    requireBroker: ctx.spec.grants.length > 0,
  });

  return toProcessIO(exec, ctx.killGraceMs);
}

// A sleep ends the forward in the imp, so the adapter closes its side first, and opens it again
// after the wake.
function buildSuspension(ctx: ImpSandboxContext): Sandbox['suspension'] {
  return {
    kind: 'memory',
    sleep: async () => {
      await ctx.routes.close(ctx.id);
      await ctx.port.sleepImp(ctx.id);
      await ctx.recorder.write({ event: 'slept', sandboxID: ctx.id });
    },
    wake: async () => {
      await ctx.port.wakeImp(ctx.id);
      await ctx.recorder.write({ event: 'woken', sandboxID: ctx.id });
      await ctx.routes.open(ctx.id, ctx.spec);
    },
  };
}

async function writeGuestFiles(ctx: ImpSandboxContext, files: readonly FileSpec[]): Promise<void> {
  for (const file of files) {
    requireGuestPath(file.path);

    // oxlint-disable-next-line no-await-in-loop -- writes in order, so a later file wins
    const io = await startImpProcess(ctx, {
      argv: ['sh', '-c', 'mkdir -p "$(dirname "$1")" && cat > "$1"', 'sh', file.path],
    });

    // oxlint-disable-next-line no-await-in-loop -- writes in order, so a later file wins
    const result = await runCommand(io, file.content, undefined);

    requireSuccess(result, `copy into ${file.path}`);
  }
}

async function readGuestFile(ctx: ImpSandboxContext, path: string): Promise<FileSpec> {
  requireGuestPath(path);

  const io = await startImpProcess(ctx, { argv: ['cat', '--', path] });
  const [content, result] = await Promise.all([
    new Response(io.stdout).bytes(),
    runCommand({ ...io, stdout: new Blob().stream() }, undefined, undefined),
  ]);

  requireSuccess(result, `copy out of ${path}`);
  return { path, content: new Uint8Array(content) };
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
