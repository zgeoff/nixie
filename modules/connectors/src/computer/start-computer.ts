import type { Clock } from '@heynixie/clock';
import { systemClock } from '@heynixie/clock';
import type { Logger } from '@heynixie/logger';
import type { Sandbox, SandboxAdapter } from '@heynixie/sandbox';
import { buildSandboxSpec, findKeptSandbox, sandboxSizes } from '@heynixie/sandbox';
import { computerOwners } from './computer-owners';
import { copyComputerDisk } from './copy-computer-disk';
import type { GuestProcess } from './exchange-with-guest';
import { exchangeWithGuest } from './exchange-with-guest';
import type { CallResult, ComputerCall, ComputerKind } from './types';

export interface ComputerOptions {
  readonly adapter: SandboxAdapter;

  // the image name of each kind
  readonly images: Readonly<Record<ComputerKind, string>>;

  // the program each guest runs
  readonly argv: Readonly<Record<ComputerKind, readonly string[]>>;

  // the ranges the deployment lists as internal, which each guest's proxy refuses
  readonly deniedRanges: readonly string[];
  readonly logger: Logger;
  readonly clock?: Clock;

  // how long a sandbox idles before it sleeps
  readonly idleMs?: Readonly<Record<ComputerKind, number>>;

  // how long a call waits for its turn before it returns busy
  readonly turnWaitMs?: number;

  // the most bytes of one frame from a guest
  readonly maxMessageBytes?: number;
}

// the tabs the model may name, each mapped to the guest's tab of the current browser process
export interface ComputerTabs {
  readonly add: (guestTab: string) => string;
  readonly find: (tab: string) => string | null;
  readonly remove: (tab: string) => void;
  readonly isEmpty: () => boolean;
}

export interface Computer {
  readonly call: (kind: ComputerKind, call: ComputerCall) => Promise<CallResult>;

  // keeps a sandbox awake until the returned function runs, or until `forMs` passes
  readonly hold: (kind: ComputerKind, forMs: number) => () => void;

  // destroys the sandboxes of these kinds, so the next call makes empty ones
  readonly reset: (kinds: readonly ComputerKind[]) => Promise<void>;

  readonly tabs: ComputerTabs;
  readonly stop: () => Promise<void>;
}

interface KindState {
  sandbox: Sandbox | null;
  guest: GuestProcess | null;
  isAsleep: boolean;

  // the end of the chain of calls, which holds the sandbox one call at a time
  turn: Promise<void>;
  holds: number;
  idle: AbortController | null;
  readonly tabs: Map<string, string>;
  tabCount: number;
}

export function startComputer(options: ComputerOptions): Computer {
  const states: Record<ComputerKind, KindState> = {
    browser: buildKindState(),
    shell: buildKindState(),
  };

  const clock = options.clock ?? systemClock;
  const context = { options, clock, states };

  return {
    call: (kind, call) => runCall(context, kind, call),
    hold: (kind, forMs) => holdAwake(context, kind, forMs),
    reset: (kinds) => resetKinds(context, kinds),
    tabs: buildTabs(states.browser),
    stop: async () => {
      await Promise.all([stopGuest(states.browser), stopGuest(states.shell)]);
    },
  };
}

function buildKindState(): KindState {
  return {
    sandbox: null,
    guest: null,
    isAsleep: false,
    turn: Promise.resolve(),
    holds: 0,
    idle: null,
    tabs: new Map(),
    tabCount: 0,
  };
}

interface ComputerContext {
  readonly options: ComputerOptions;
  readonly clock: Clock;
  readonly states: Record<ComputerKind, KindState>;
}

const defaultTurnWaitMs = 60_000;

async function runCall(
  context: ComputerContext,
  kind: ComputerKind,
  call: ComputerCall,
): Promise<CallResult> {
  const state = context.states[kind];

  const release = await takeTurn(state, context.options.turnWaitMs ?? defaultTurnWaitMs, context);

  if (release === null) {
    return { status: 'busy' };
  }

  state.idle?.abort();

  try {
    return await runInTurn(context, kind, call);
  } finally {
    release();
    scheduleSleep(context, kind);
  }
}

// Waits for the calls ahead, up to the limit. A call that times out leaves its place in the chain,
// which frees when the calls ahead end.
async function takeTurn(
  state: KindState,
  limitMs: number,
  context: ComputerContext,
): Promise<(() => void) | null> {
  const previous = state.turn;
  const ended = Promise.withResolvers<void>();

  state.turn = ended.promise;

  const gave = new AbortController();

  const outcome = await Promise.race([
    labelAfter(previous, 'turn'),
    labelAfter(context.clock.sleep(limitMs, gave.signal), 'late'),
  ]);

  gave.abort();

  if (outcome === 'late') {
    void resolveAfter(previous, ended);

    return null;
  }

  return () => {
    ended.resolve();
  };
}

async function labelAfter<Label extends string>(
  waiting: Promise<unknown>,
  label: Label,
): Promise<Label> {
  await waiting;

  return label;
}

async function resolveAfter(
  waiting: Promise<unknown>,
  ended: PromiseWithResolvers<void>,
): Promise<void> {
  await waiting;

  ended.resolve();
}

async function runInTurn(
  context: ComputerContext,
  kind: ComputerKind,
  call: ComputerCall,
): Promise<CallResult> {
  try {
    const sandbox = await readySandbox(context, kind);
    const guest = await readyGuest(context, kind, sandbox);
    const before = await sandbox.readMemoryKills();
    const exchanged = await exchangeWithGuest(guest, call, context.clock);
    const after = await sandbox.readMemoryKills();

    if (before.kind === 'count' && after.kind === 'count' && after.kills > before.kills) {
      await stopGuest(context.states[kind]);

      return { status: 'out_of_memory' };
    }

    if (exchanged.kind === 'broken') {
      context.options.logger('computer.guest_failed', { kind, reason: exchanged.message }, 'warn');

      await stopGuest(context.states[kind]);

      return { status: 'failed', message: exchanged.message };
    }

    return { status: 'reply', reply: exchanged.reply, refusal: exchanged.refusal };
  } catch (error) {
    context.options.logger('computer.call_failed', { kind, reason: String(error) }, 'warn');

    await stopGuest(context.states[kind]);

    return { status: 'failed', message: error instanceof Error ? error.message : String(error) };
  }
}

// The sandbox of the kind: the kept one that holds today's spec, or a new one. A kept sandbox of an
// older spec gives its disk to the new one, which replaces it.
async function readySandbox(context: ComputerContext, kind: ComputerKind): Promise<Sandbox> {
  const state = context.states[kind];

  if (state.sandbox !== null && !state.sandbox.isRetired) {
    if (state.isAsleep) {
      await wakeSandbox(state, state.sandbox);
    }

    return state.sandbox;
  }

  const spec = buildSandboxSpec({
    kind,
    image: context.options.images[kind],
    owner: computerOwners[kind],
    limits: sandboxSizes[kind],
  });

  const existing = await context.options.adapter.list(computerOwners[kind]);

  const kept = findKeptSandbox(existing, spec);

  if (kept !== undefined) {
    state.sandbox = kept;
    state.isAsleep = false;

    return kept;
  }

  const created = await context.options.adapter.create(spec);

  await replaceOld(context, kind, existing, created);

  state.sandbox = created;
  state.isAsleep = false;

  state.tabs.clear();

  return created;
}

async function wakeSandbox(state: KindState, sandbox: Sandbox): Promise<void> {
  if (sandbox.suspension.kind === 'memory') {
    await sandbox.suspension.wake();
  }

  state.isAsleep = false;
}

async function replaceOld(
  context: ComputerContext,
  kind: ComputerKind,
  old: readonly Sandbox[],
  created: Sandbox,
): Promise<void> {
  for (const sandbox of old) {
    try {
      await copyComputerDisk(sandbox, created, kind);
    } catch (error) {
      context.options.logger('computer.copy_failed', { kind, reason: String(error) }, 'warn');
    }

    await sandbox.destroy();
  }
}

const defaultMaxMessageBytes = 48 * 1024 * 1024;

async function readyGuest(
  context: ComputerContext,
  kind: ComputerKind,
  sandbox: Sandbox,
): Promise<GuestProcess> {
  const state = context.states[kind];

  if (state.guest !== null) {
    return state.guest;
  }

  const stream = await sandbox.spawn({
    argv: context.options.argv[kind],
    env: { NIXIE_DENIED_RANGES: context.options.deniedRanges.join(',') },
    maxMessageBytes: context.options.maxMessageBytes ?? defaultMaxMessageBytes,
  });

  const guest = { stream, frames: stream.messages[Symbol.asyncIterator]() };

  state.guest = guest;

  state.tabs.clear();

  return guest;
}

async function stopGuest(state: KindState): Promise<void> {
  const guest = state.guest;

  state.guest = null;

  state.tabs.clear();

  if (guest !== null) {
    try {
      await guest.stream.stop();
    } catch {
      // a guest that is already gone has nothing to stop
    }
  }
}

export const defaultIdleMs: Readonly<Record<ComputerKind, number>> = {
  browser: 30 * 60 * 1000,
  shell: 5 * 60 * 1000,
};

// Puts the sandbox to sleep once it has idled for its time, unless a call or a hold wants it.
function scheduleSleep(context: ComputerContext, kind: ComputerKind): void {
  const state = context.states[kind];

  if (state.holds > 0 || state.sandbox === null) {
    return;
  }

  state.idle?.abort();

  const idle = new AbortController();

  state.idle = idle;

  const idleMs = (context.options.idleMs ?? defaultIdleMs)[kind];

  void sleepAfterIdle(context, kind, idle, idleMs);
}

async function sleepAfterIdle(
  context: ComputerContext,
  kind: ComputerKind,
  idle: AbortController,
  idleMs: number,
): Promise<void> {
  await context.clock.sleep(idleMs, idle.signal);

  const state = context.states[kind];

  if (idle.signal.aborted || state.sandbox === null || state.holds > 0) {
    return;
  }

  const release = await takeTurn(state, 0, context);

  if (release === null) {
    return;
  }

  try {
    if (idle.signal.aborted || state.sandbox.suspension.kind !== 'memory') {
      return;
    }

    await stopGuest(state);

    await state.sandbox.suspension.sleep();

    state.isAsleep = true;
  } catch (error) {
    context.options.logger('computer.sleep_failed', { kind, reason: String(error) }, 'warn');
  } finally {
    release();
  }
}

function holdAwake(context: ComputerContext, kind: ComputerKind, forMs: number): () => void {
  const state = context.states[kind];

  const ended = new AbortController();

  state.holds += 1;
  state.idle?.abort();

  const release = (): void => {
    if (ended.signal.aborted) {
      return;
    }

    ended.abort();

    state.holds -= 1;

    scheduleSleep(context, kind);
  };

  void releaseAfter(context.clock.sleep(forMs, ended.signal), release);

  return release;
}

async function releaseAfter(waiting: Promise<unknown>, release: () => void): Promise<void> {
  await waiting;

  release();
}

async function resetKinds(context: ComputerContext, kinds: readonly ComputerKind[]): Promise<void> {
  for (const kind of kinds) {
    const state = context.states[kind];

    state.idle?.abort();

    const release = await takeTurn(state, Number.POSITIVE_INFINITY, context);

    try {
      await stopGuest(state);

      const sandboxes = await context.options.adapter.list(computerOwners[kind]);

      for (const sandbox of sandboxes) {
        await sandbox.destroy();
      }

      state.sandbox = null;
      state.isAsleep = false;
    } finally {
      release?.();
    }
  }
}

function buildTabs(state: KindState): ComputerTabs {
  return {
    add: (guestTab) => {
      state.tabCount += 1;

      const tab = `t${String(state.tabCount)}`;

      state.tabs.set(tab, guestTab);

      return tab;
    },
    find: (tab) => state.tabs.get(tab) ?? null,
    remove: (tab) => {
      state.tabs.delete(tab);
    },
    isEmpty: () => state.tabs.size === 0,
  };
}
