import type { Clock } from '@heynixie/clock';
import { systemClock } from '@heynixie/clock';
import type { Logger } from '@heynixie/logger';
import type { Sandbox, SandboxAdapter } from '@heynixie/sandbox';
import { buildSandboxSpec, findKeptSandbox, sandboxSizes } from '@heynixie/sandbox';
import { computerOwner, legacyComputerOwners } from './computer-owner';
import { computerFolders, copyComputerFolder } from './copy-computer-folder';
import type { GuestSession, OutOfCallScans } from './make-guest-session';
import { makeGuestSession } from './make-guest-session';
import { moveOldSandboxes, wakeOld } from './move-old-sandboxes';
import type { CallResult, ComputerCall } from './types';
import { openComputerWatch } from './watch/open-computer-watch';
import type { WatchConnection, WatchSocket } from './watch/types';

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

  // the tab the model names for a guest's tab, or null when none does
  readonly findGuest: (guestTab: string) => string | null;
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

  // Opens a watch of the desktop for a socket: it wakes the sandbox if it sleeps, holds it awake and
  // relays the desktop's VNC stream to the socket, minus the viewer's input. The watch counts from
  // this call until the connection it returns ends.
  readonly watch: (socket: WatchSocket) => WatchConnection;

  // true while a watch is open
  readonly isWatched: () => boolean;

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

  // the watches open now, which hold no turn
  readonly watches: { count: number };
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
    watches: { count: 0 },
  };

  const context: ComputerContext = { options, clock: options.clock ?? systemClock, state };

  return {
    call: (call) => runCall(context, call),
    settleMove: () => settleMove(context),
    hold: (forMs) => holdAwake(context, forMs),
    watch: (socket) =>
      openComputerWatch(
        {
          watches: state.watches,
          logger: context.options.logger,
          hold: () => holdAwake(context, null),
          readGuest: (isEnded) => readWatchGuest(context, isEnded),
        },
        socket,
      ),
    isWatched: () => state.watches.count > 0,
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

// A hold of null lasts until the function it returns runs.
function holdAwake(context: ComputerContext, forMs: number | null): () => void {
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

  if (forMs !== null) {
    void releaseAfter(context.clock.sleep(forMs, ended.signal), release);
  }

  return release;
}

async function releaseAfter(waiting: Promise<unknown>, release: () => void): Promise<void> {
  await waiting;

  release();
}

// The guest for a watch's stream: the running one, or one started after waking the sandbox. The
// turn is held only while it starts. The result is null when another call kept the turn past the
// limit, the move did not finish, or the watch ended first.
async function readWatchGuest(
  context: ComputerContext,
  isEnded: () => boolean,
): Promise<GuestSession | null> {
  const state = context.state;

  if (state.guest !== null && !state.isAsleep) {
    return state.guest;
  }

  const release = await takeTurn(state, context.options.turnWaitMs ?? defaultTurnWaitMs, context);

  if (release === null) {
    return null;
  }

  state.idle?.abort();

  try {
    if (isEnded()) {
      return null;
    }

    const sandbox = await readySandbox(context);
    const isMoved = await moveOldSandboxes(context, sandbox);

    return isMoved && !isEnded() ? await readyGuest(context, sandbox) : null;
  } finally {
    release();
    scheduleSleep(context);
  }
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
    findGuest: (guestTab) => {
      const named = [...state.tabs].find(([, guest]) => guest === guestTab);

      return named === undefined ? null : named[0];
    },
    remove: (tab) => {
      state.tabs.delete(tab);
    },
    isEmpty: () => state.tabs.size === 0,
  };
}
