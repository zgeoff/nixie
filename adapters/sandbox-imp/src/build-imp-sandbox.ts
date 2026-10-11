import type {
  ExecResult,
  ExecSpec,
  FileSpec,
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

// Opening the forward and running an exec both wake a sleeping imp, so a call on an imp the adapter
// put to sleep wakes it first and records the wake.
async function startRoute(ctx: ImpSandboxContext): Promise<void> {
  if (ctx.sleeping.isAsleep(ctx.id)) {
    await updateImpAwake(ctx);
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

    // oxlint-disable-next-line no-await-in-loop -- writes in order, so a later file wins
    const io = await startImpProcess(ctx, {
      argv: ['sh', '-c', 'mkdir -p "$(dirname "$1")" && cat > "$1"', 'sh', file.path],
    });

    // oxlint-disable-next-line no-await-in-loop -- writes in order, so a later file wins
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
