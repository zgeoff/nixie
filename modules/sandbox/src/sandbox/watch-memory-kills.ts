import type { Logger } from '@heynixie/logger';
import { match } from 'ts-pattern';
import type {
  ExecStream,
  MemoryKillRead,
  Sandbox,
  SandboxAdapter,
  SandboxKind,
  SandboxSpec,
  SpawnSpec,
} from '../types';

export interface WatchMemoryKillsOptions {
  readonly log: Logger;
  readonly readTimeoutMs?: number;
}

// What the watcher keeps for one sandbox ID. The map holds it by ID because read and list hand out
// a new sandbox object for the same sandbox.
interface WatchedSandbox {
  // the count at the last read that gave one, or null when none did
  last: number | null;
  needsBaseline: boolean;

  // reads of one sandbox run one after another, so a chain tail stands for all of them
  pending: Promise<void>;
}

const defaultReadTimeoutMs = 2000;

export function watchMemoryKills(
  adapter: SandboxAdapter,
  options: WatchMemoryKillsOptions,
): SandboxAdapter {
  const watched = new Map<string, WatchedSandbox>();

  const readTimeoutMs = options.readTimeoutMs ?? defaultReadTimeoutMs;

  const watch = (sandbox: Sandbox, isCreated: boolean): Sandbox => {
    let entry = watched.get(sandbox.id);

    if (entry === undefined) {
      entry = { last: isCreated ? 0 : null, needsBaseline: !isCreated, pending: Promise.resolve() };

      watched.set(sandbox.id, entry);
    }

    return wrapSandbox(sandbox, entry, {
      log: options.log,
      readTimeoutMs,
      drop: () => {
        if (watched.get(sandbox.id) === entry) {
          watched.delete(sandbox.id);
        }
      },
    });
  };

  options.log('sandbox.memory_watch', {}, 'info');

  return {
    id: adapter.id,
    create: async (spec) => {
      const sandbox = await adapter.create(spec);

      return watch(sandbox, true);
    },
    read: async (id) => {
      const sandbox = await adapter.read(id);

      return sandbox === null ? null : watch(sandbox, false);
    },
    list: async (owner) => {
      const sandboxes = await adapter.list(owner);

      return sandboxes.map((sandbox) => watch(sandbox, false));
    },
    addSecret: adapter.addSecret,
    addImage: adapter.addImage,
    checkRuntime: adapter.checkRuntime,
  };
}

interface WrapContext {
  readonly log: Logger;
  readonly readTimeoutMs: number;
  readonly drop: () => void;
}

function wrapSandbox(sandbox: Sandbox, entry: WatchedSandbox, ctx: WrapContext): Sandbox {
  return {
    get id() {
      return sandbox.id;
    },
    get spec() {
      return sandbox.spec;
    },
    get isRetired() {
      return sandbox.isRetired;
    },
    exec: sandbox.exec,
    copyIn: sandbox.copyIn,
    copyOut: sandbox.copyOut,
    resolveHome: sandbox.resolveHome,
    readFilePaths: sandbox.readFilePaths,
    applyMove: sandbox.applyMove,
    toolRoute: sandbox.toolRoute,
    readMemoryKills: sandbox.readMemoryKills,
    spawn: (command) => spawnWatched(sandbox, entry, ctx, command),
    get suspension() {
      const suspension = sandbox.suspension;

      if (suspension.kind === 'none') {
        return suspension;
      }

      return {
        kind: 'memory' as const,
        sleep: async () => {
          await entry.pending;

          await suspension.sleep();
        },
        wake: suspension.wake,
      };
    },
    destroy: async () => {
      await entry.pending;

      try {
        await sandbox.destroy();
      } finally {
        ctx.drop();
      }
    },
  };
}

async function spawnWatched(
  sandbox: Sandbox,
  entry: WatchedSandbox,
  ctx: WrapContext,
  command: SpawnSpec,
): Promise<ExecStream> {
  if (entry.needsBaseline) {
    entry.needsBaseline = false;

    enqueueRead(entry, () => runBaselineRead(sandbox, entry, ctx));
  }

  await entry.pending;

  const stream = await sandbox.spawn(command);

  const onEnd = (): void => {
    enqueueRead(entry, () => runEndRead(sandbox, entry, ctx));
  };

  void waitForEnd(stream.exit, onEnd);

  return stream;
}

function enqueueRead(entry: WatchedSandbox, run: () => Promise<void>): void {
  entry.pending = runAfter(entry.pending, run);
}

async function runAfter(previous: Promise<void>, run: () => Promise<void>): Promise<void> {
  await previous;
  await run();
}

async function runBaselineRead(
  sandbox: Sandbox,
  entry: WatchedSandbox,
  ctx: WrapContext,
): Promise<void> {
  const read = await readWithin(sandbox, ctx.readTimeoutMs);

  if (read.kind !== 'count') {
    return;
  }

  entry.last = read.kills;

  if (read.kills > 0) {
    writeUnknown(sandbox, ctx.log, 'no_baseline');
  }
}

const failedRead: MemoryKillRead = { kind: 'failed' };

// A read that ignores its signal still ends at the timeout, as a failed read.
async function readWithin(sandbox: Sandbox, timeoutMs: number): Promise<MemoryKillRead> {
  const controller = new AbortController();

  const timedOut = Promise.withResolvers<MemoryKillRead>();

  const timer = setTimeout(() => {
    controller.abort();
    timedOut.resolve(failedRead);
  }, timeoutMs);

  try {
    return await Promise.race([sandbox.readMemoryKills(controller.signal), timedOut.promise]);
  } catch {
    return failedRead;
  } finally {
    clearTimeout(timer);
  }
}

type MemoryKillEnded = 'turn' | 'step' | 'fetch';

type MemoryKillUnknownReason = 'unsupported' | 'read_failed' | 'no_baseline' | 'counter_reset';

interface MemoryKillUnknownLine {
  readonly event: 'sandbox.memory_kill_unknown';
  readonly ended: MemoryKillEnded;
  readonly kind: SandboxKind;
  readonly memoryMiB: number;
  readonly sandboxID: string;
  readonly reason: MemoryKillUnknownReason;
}

function writeUnknown(sandbox: Sandbox, log: Logger, reason: MemoryKillUnknownReason): void {
  const line: MemoryKillUnknownLine = {
    event: 'sandbox.memory_kill_unknown',
    ...describeEnd(sandbox.spec, sandbox.id),
    reason,
  };

  try {
    log(line.event, toFields(line), 'warn');
  } catch {
    // a log that throws never changes an exit
  }
}

interface MemoryKillLine {
  readonly event: 'sandbox.memory_kill';
  readonly ended: MemoryKillEnded;
  readonly kind: SandboxKind;
  readonly memoryMiB: number;
  readonly sandboxID: string;
  readonly kills: number;
}

function describeEnd(
  spec: SandboxSpec,
  sandboxID: string,
): Pick<MemoryKillLine, 'ended' | 'kind' | 'memoryMiB' | 'sandboxID'> {
  return {
    ended: pickEnded(spec.kind),
    kind: spec.kind,
    memoryMiB: spec.limits.memoryMiB,
    sandboxID,
  };
}

function pickEnded(kind: SandboxKind): MemoryKillEnded {
  if (kind === 'conversation') {
    return 'turn';
  }

  return kind === 'fetch' ? 'fetch' : 'step';
}

function toFields(line: MemoryKillLine | MemoryKillUnknownLine): Record<string, string | number> {
  const { event: _event, ...fields } = line;

  return fields;
}

async function runEndRead(
  sandbox: Sandbox,
  entry: WatchedSandbox,
  ctx: WrapContext,
): Promise<void> {
  const read = await readWithin(sandbox, ctx.readTimeoutMs);

  const verdict = pickVerdict(read, entry.last);

  entry.last = verdict.last;

  try {
    match(verdict)
      .with({ kind: 'killed' }, (killed) => {
        const line: MemoryKillLine = {
          event: 'sandbox.memory_kill',
          ...describeEnd(sandbox.spec, sandbox.id),
          kills: killed.kills,
        };

        ctx.log(line.event, toFields(line), 'error');
      })
      .with({ kind: 'unknown' }, (unknown) => {
        writeUnknown(sandbox, ctx.log, unknown.reason);
      })
      .with({ kind: 'quiet' }, () => {})
      .exhaustive();
  } catch {
    // a log that throws never changes an exit
  }
}

type Verdict =
  | { readonly kind: 'quiet'; readonly last: number }
  | { readonly kind: 'killed'; readonly last: number; readonly kills: number }
  | {
      readonly kind: 'unknown';
      readonly last: number | null;
      readonly reason: MemoryKillUnknownReason;
    };

function pickVerdict(read: MemoryKillRead, last: number | null): Verdict {
  return match(read)
    .with({ kind: 'unsupported' }, (): Verdict => ({
      kind: 'unknown',
      last,
      reason: 'unsupported',
    }))
    .with({ kind: 'failed' }, (): Verdict => ({ kind: 'unknown', last, reason: 'read_failed' }))
    .with({ kind: 'count' }, (counted): Verdict => {
      const kills = counted.kills;

      if (last === null) {
        return { kind: 'unknown', last: kills, reason: 'no_baseline' };
      }

      if (kills < last) {
        return { kind: 'unknown', last: kills, reason: 'counter_reset' };
      }

      return kills > last
        ? { kind: 'killed', last: kills, kills: kills - last }
        : { kind: 'quiet', last: kills };
    })
    .exhaustive();
}

// runs as soon as the exit settles, ahead of any later step of a caller that awaits the exit
async function waitForEnd(exit: Promise<unknown>, onEnd: () => void): Promise<void> {
  try {
    await exit;
  } catch {
    // a rejected exit is the caller's to handle, and ends the program like any other
  }

  onEnd();
}
