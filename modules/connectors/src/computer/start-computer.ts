import { join } from 'node:path';
import type { Clock } from '@heynixie/clock';
import { systemClock } from '@heynixie/clock';
import type { Logger } from '@heynixie/logger';
import type { Sandbox, SandboxAdapter } from '@heynixie/sandbox';
import { buildSandboxSpec, findKeptSandbox, sandboxSizes } from '@heynixie/sandbox';
import { computerOwner, legacyComputerOwners } from './computer-owner';
import type { ComputerFolder } from './copy-computer-folder';
import { computerFolders, copyComputerFolder } from './copy-computer-folder';
import type { GuestSession, OutOfCallScans } from './make-guest-session';
import { makeGuestSession } from './make-guest-session';
import type { CallResult, ComputerCall } from './types';

export interface ComputerOptions {
  readonly adapter: SandboxAdapter;

  // the image name of the computer
  readonly image: string;

  // the program the guest runs
  readonly argv: readonly string[];

  // the ranges the deployment lists as internal, which the guest's proxy refuses
  readonly deniedRanges: readonly string[];

  // the time zone the browser's pages see
  readonly timeZone: string;

  // The scans of a request that no call made, such as a page's own request while nobody calls a
  // tool. They carry no typed URL to exempt, and a refusal fails the request in the page.
  readonly scans: OutOfCallScans;
  readonly logger: Logger;
  readonly clock?: Clock;

  // The environment that names the guest's home on the computer's disk, and the home of the guests
  // of the browser and shell images that the move reads. The test sandbox sets neither, because it
  // gives each guest a home of its own.
  readonly homeEnv?: Readonly<Record<string, string>>;
  readonly legacyHomeEnv?: Readonly<Record<string, string>>;

  // how long the sandbox idles before it sleeps
  readonly idleMs?: number;

  // how long a call waits for its turn before it returns busy
  readonly turnWaitMs?: number;

  // the most bytes of one frame from the guest
  readonly maxMessageBytes?: number;
}

// the tabs the model may name, each mapped to the guest's tab of the current browser process
interface ComputerTabs {
  readonly add: (guestTab: string) => string;
  readonly find: (tab: string) => string | null;
  readonly remove: (tab: string) => void;
  readonly isEmpty: () => boolean;
}

type MoveGate = 'ready' | 'moving' | 'busy';

export interface Computer {
  readonly call: (call: ComputerCall) => Promise<CallResult>;

  // Moves the disks of an earlier release into the computer when they are still there. Every tool
  // asks first, and the answer is moving until a copy has succeeded.
  readonly settleMove: () => Promise<MoveGate>;

  // keeps the sandbox awake until the returned function runs, or until `forMs` passes
  readonly hold: (forMs: number) => () => void;

  // destroys the computer and any sandbox of an earlier release, so the next call makes an empty one
  readonly reset: () => Promise<void>;

  readonly tabs: ComputerTabs;
  readonly stop: () => Promise<void>;
}

interface ComputerState {
  sandbox: Sandbox | null;
  guest: GuestSession | null;
  isAsleep: boolean;

  // true once no sandbox of an earlier release is left, in this process
  isMoved: boolean;

  // the end of the chain of calls, which holds the sandbox one call at a time
  turn: Promise<void>;
  holds: number;
  idle: AbortController | null;
  readonly tabs: Map<string, string>;
  tabCount: number;
}

interface ComputerContext {
  readonly options: ComputerOptions;
  readonly clock: Clock;
  readonly state: ComputerState;
}

export function startComputer(options: ComputerOptions): Computer {
  const state: ComputerState = {
    sandbox: null,
    guest: null,
    isAsleep: false,
    isMoved: false,
    turn: Promise.resolve(),
    holds: 0,
    idle: null,
    tabs: new Map(),
    tabCount: 0,
  };

  const context: ComputerContext = { options, clock: options.clock ?? systemClock, state };

  return {
    call: (call) => runCall(context, call),
    settleMove: () => settleMove(context),
    hold: (forMs) => holdAwake(context, forMs),
    reset: () => resetComputer(context),
    tabs: buildTabs(state),
    stop: () => stopGuest(state),
  };
}

const defaultTurnWaitMs = 60_000;

async function runCall(context: ComputerContext, call: ComputerCall): Promise<CallResult> {
  const release = await takeTurn(
    context.state,
    context.options.turnWaitMs ?? defaultTurnWaitMs,
    context,
  );

  if (release === null) {
    return { status: 'busy' };
  }

  context.state.idle?.abort();

  try {
    return await runInTurn(context, call);
  } finally {
    release();
    scheduleSleep(context);
  }
}

// Waits for the calls ahead, up to the limit. A call that times out leaves its place in the chain,
// which frees when the calls ahead end.
async function takeTurn(
  state: ComputerState,
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

async function runInTurn(context: ComputerContext, call: ComputerCall): Promise<CallResult> {
  try {
    const sandbox = await readySandbox(context);
    const isMoved = await moveOldSandboxes(context, sandbox);

    if (!isMoved) {
      return { status: 'moving' };
    }

    const guest = await readyGuest(context, sandbox);
    const before = await sandbox.readMemoryKills();
    const exchanged = await guest.exchange(call);
    const after = await sandbox.readMemoryKills();

    if (before.kind === 'count' && after.kind === 'count' && after.kills > before.kills) {
      // A command that the shared limit of the terminal ends is the one kill that leaves Chromium
      // alone, so a run keeps the guest and the tabs; any other call may have lost the browser.
      if (call.request.op !== 'run') {
        await stopGuest(context.state);
      }

      return { status: 'out_of_memory' };
    }

    if (exchanged.kind === 'broken') {
      context.options.logger('computer.guest_failed', { reason: exchanged.message }, 'warn');

      await stopGuest(context.state);

      return { status: 'failed', message: exchanged.message };
    }

    return { status: 'reply', reply: exchanged.reply, refusal: exchanged.refusal };
  } catch (error) {
    context.options.logger('computer.call_failed', { reason: String(error) }, 'warn');

    await stopGuest(context.state);

    return { status: 'failed', message: error instanceof Error ? error.message : String(error) };
  }
}

// The computer's sandbox: the kept one that holds today's spec, or a new one. A kept sandbox of an
// older spec gives its disk to the new one, which replaces it.
async function readySandbox(context: ComputerContext): Promise<Sandbox> {
  const state = context.state;

  if (state.sandbox !== null && !state.sandbox.isRetired) {
    if (state.isAsleep) {
      await wakeSandbox(state, state.sandbox);
    }

    return state.sandbox;
  }

  const spec = buildComputerSpec(context);

  const existing = await context.options.adapter.list(computerOwner);

  const kept = findKeptSandbox(existing, spec);

  if (kept !== undefined) {
    state.sandbox = kept;
    state.isAsleep = false;

    return kept;
  }

  const created = await context.options.adapter.create(spec);

  await replaceOld(context, existing, created);

  state.sandbox = created;
  state.isAsleep = false;

  state.tabs.clear();

  return created;
}

async function wakeSandbox(state: ComputerState, sandbox: Sandbox): Promise<void> {
  if (sandbox.suspension.kind === 'memory') {
    await sandbox.suspension.wake();
  }

  state.isAsleep = false;
}

function buildComputerSpec(context: ComputerContext) {
  return buildSandboxSpec({
    kind: 'computer',
    image: context.options.image,
    owner: computerOwner,
    limits: sandboxSizes.computer,
  });
}

async function replaceOld(
  context: ComputerContext,
  old: readonly Sandbox[],
  created: Sandbox,
): Promise<void> {
  const homeEnv = context.options.homeEnv ?? {};

  for (const sandbox of old) {
    try {
      await wakeOld(sandbox);

      for (const folder of computerFolders) {
        await copyComputerFolder({
          from: sandbox,
          fromEnv: homeEnv,
          to: created,
          toEnv: homeEnv,
          folder,
        });
      }
    } catch (error) {
      context.options.logger('computer.copy_failed', { reason: String(error) }, 'warn');
    }

    await sandbox.destroy();
  }
}

async function wakeOld(sandbox: Sandbox): Promise<void> {
  if (sandbox.suspension.kind === 'memory') {
    await sandbox.suspension.wake();
  }
}

const diskUsedMarker = '.nixie-disk-used';

// Copies the profile and the files of the earlier release's browser and shell sandboxes into the
// computer's disk and destroys both, only when every copy passed its check. It runs before the
// guest starts, so Chromium has written nothing to the new disk.
async function moveOldSandboxes(context: ComputerContext, sandbox: Sandbox): Promise<boolean> {
  if (context.state.isMoved) {
    return true;
  }

  const old = await readOldSandboxes(context);

  if (old.length === 0) {
    context.state.isMoved = true;

    return true;
  }

  const startedAtMs = context.clock.now();

  try {
    for (const entry of old) {
      await wakeOld(entry.sandbox);

      await copyComputerFolder({
        from: entry.sandbox,
        fromEnv: context.options.legacyHomeEnv ?? {},
        to: sandbox,
        toEnv: context.options.homeEnv ?? {},
        folder: entry.folder,
      });
    }

    const home = await sandbox.resolveHome(context.options.homeEnv ?? {});

    await sandbox.copyIn([
      { path: join(home.copyPath, diskUsedMarker), content: new Uint8Array() },
    ]);
  } catch (error) {
    context.options.logger(
      'computer.move_failed',
      { reason: error instanceof Error ? error.message : String(error) },
      'warn',
    );

    return false;
  }

  for (const entry of old) {
    try {
      await entry.sandbox.destroy();
    } catch (error) {
      context.options.logger('computer.move_failed', { reason: String(error) }, 'warn');

      return false;
    }
  }

  context.state.isMoved = true;

  context.options.logger('computer.moved', {
    sandboxes: old.length,
    durationMs: context.clock.now() - startedAtMs,
  });

  return true;
}

// the earlier sandboxes, each with the folder it kept: the browser's profile and the shell's files
const legacySources = [
  { owner: legacyComputerOwners.browser, folder: 'profile' },
  { owner: legacyComputerOwners.shell, folder: 'files' },
] as const satisfies readonly { readonly owner: string; readonly folder: ComputerFolder }[];

async function readOldSandboxes(
  context: ComputerContext,
): Promise<readonly { readonly sandbox: Sandbox; readonly folder: ComputerFolder }[]> {
  const listed = await Promise.all(
    legacySources.map(async (source) => {
      const sandboxes = await context.options.adapter.list(source.owner);

      return sandboxes.map((sandbox) => ({ sandbox, folder: source.folder }));
    }),
  );

  return listed.flat();
}

const defaultMaxMessageBytes = 48 * 1024 * 1024;

async function readyGuest(context: ComputerContext, sandbox: Sandbox): Promise<GuestSession> {
  const state = context.state;

  if (state.guest !== null) {
    return state.guest;
  }

  const stream = await sandbox.spawn({
    argv: context.options.argv,
    env: {
      ...context.options.homeEnv,
      NIXIE_DENIED_RANGES: context.options.deniedRanges.join(','),
      NIXIE_TIME_ZONE: context.options.timeZone,
    },
    maxMessageBytes: context.options.maxMessageBytes ?? defaultMaxMessageBytes,
  });

  const guest = makeGuestSession({
    stream,
    scans: context.options.scans,
    clock: context.clock,
    logger: context.options.logger,
  });

  state.guest = guest;

  state.tabs.clear();

  return guest;
}

async function stopGuest(state: ComputerState): Promise<void> {
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

const defaultIdleMs = 30 * 60 * 1000;

// Puts the sandbox to sleep once it has idled for its time, unless a call or a hold wants it.
function scheduleSleep(context: ComputerContext): void {
  const state = context.state;

  if (state.holds > 0 || state.sandbox === null) {
    return;
  }

  state.idle?.abort();

  const idle = new AbortController();

  state.idle = idle;
  void sleepAfterIdle(context, idle, context.options.idleMs ?? defaultIdleMs);
}

async function sleepAfterIdle(
  context: ComputerContext,
  idle: AbortController,
  idleMs: number,
): Promise<void> {
  await context.clock.sleep(idleMs, idle.signal);

  const state = context.state;

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
    context.options.logger('computer.sleep_failed', { reason: String(error) }, 'warn');
  } finally {
    release();
  }
}

async function settleMove(context: ComputerContext): Promise<MoveGate> {
  if (context.state.isMoved) {
    return 'ready';
  }

  const release = await takeTurn(
    context.state,
    context.options.turnWaitMs ?? defaultTurnWaitMs,
    context,
  );

  if (release === null) {
    return 'busy';
  }

  context.state.idle?.abort();

  try {
    const sandbox = await readySandbox(context);
    const isMoved = await moveOldSandboxes(context, sandbox);

    return isMoved ? 'ready' : 'moving';
  } catch (error) {
    context.options.logger('computer.call_failed', { reason: String(error) }, 'warn');

    return 'moving';
  } finally {
    release();
    scheduleSleep(context);
  }
}

function holdAwake(context: ComputerContext, forMs: number): () => void {
  const state = context.state;

  const ended = new AbortController();

  state.holds += 1;
  state.idle?.abort();

  const release = (): void => {
    if (ended.signal.aborted) {
      return;
    }

    ended.abort();

    state.holds -= 1;

    scheduleSleep(context);
  };

  void releaseAfter(context.clock.sleep(forMs, ended.signal), release);

  return release;
}

async function releaseAfter(waiting: Promise<unknown>, release: () => void): Promise<void> {
  await waiting;

  release();
}

async function resetComputer(context: ComputerContext): Promise<void> {
  const state = context.state;

  state.idle?.abort();

  const release = await takeTurn(state, Number.POSITIVE_INFINITY, context);

  try {
    await stopGuest(state);

    const owners = [computerOwner, ...Object.values(legacyComputerOwners)];

    for (const owner of owners) {
      for (const sandbox of await context.options.adapter.list(owner)) {
        await sandbox.destroy();
      }
    }

    state.sandbox = null;
    state.isAsleep = false;
    state.isMoved = true;
  } finally {
    release?.();
  }
}

function buildTabs(state: ComputerState): ComputerTabs {
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
