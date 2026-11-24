import { AsyncLocalStorage } from 'node:async_hooks';
import type { Clock } from '@heynixie/clock';
import { systemClock } from '@heynixie/clock';
import type { Logger } from '@heynixie/logger';
import type { Sandbox, SandboxAdapter } from '@heynixie/sandbox';
import { buildTabs } from './build-tabs';
import type { ComputerTabs } from './build-tabs';
import { computerOwner, legacyComputerOwners } from './computer-owner';
import { makeHandover } from './handover/make-handover';
import type { Handover, HandoverRecords } from './handover/types';
import type { GuestSession, OutOfCallScans } from './make-guest-session';
import { makeGuestSession } from './make-guest-session';
import { moveOldSandboxes } from './move-old-sandboxes';
import { readySandbox } from './ready-sandbox';
import { takeTurn } from './take-turn';
import { admitRunningCall, findAdmission } from './takeover/admit-running-call';
import { makeGuestHooks } from './takeover/make-guest-hooks';
import { makeTakeover } from './takeover/make-takeover';
import { trackRunningCall } from './takeover/track-running-call';
import type { ComputerTakeover, TakeoverRecords } from './takeover/types';
import { waitForRunningCalls } from './takeover/wait-for-running-calls';
import type { CallResult, ComputerCall, ComputerContext, DesktopState } from './types';
import type { WatchHost } from './watch/open-computer-watch';
import type { WatchConnection, WatchSocket } from './watch/types';
import { watchAsDevice } from './watch/watch-as-device';

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

  // the hold on the desktop: how long it lasts with no input from its device, and where it writes
  // its records; a hold with no records writer writes none
  readonly takeover?: {
    readonly idleMs: number;
    readonly records: TakeoverRecords;
  };

  // the assistant's ask for a take-over: how long it stands with no answer, and where it writes its
  // records; an ask with no records writer writes none
  readonly handover?: {
    readonly expiryMs: number;
    readonly records: HandoverRecords;
  };
}

type MoveGate = 'ready' | 'moving' | 'busy';

export interface Computer {
  readonly call: (call: ComputerCall) => Promise<CallResult>;

  // Moves the disks of an earlier release into the computer when they are still there. Every tool
  // asks first, and the answer is moving until a copy has succeeded.
  readonly settleMove: () => Promise<MoveGate>;

  // keeps the sandbox awake until the returned function runs, or until `forMs` passes
  readonly hold: (forMs: number) => () => void;

  // Opens a watch of the desktop for a socket of a device session: it wakes the sandbox if it
  // sleeps, holds it awake and relays the desktop's VNC stream to the socket. The viewer's key and
  // pointer messages pass only while that device holds the desktop.
  readonly watch: (socket: WatchSocket, deviceID: string) => WatchConnection;

  // the hold that a device session takes on the desktop and gives back
  readonly takeover: ComputerTakeover;

  // the assistant's ask for a person to take the desktop
  readonly handover: Handover;

  // true while a watch is open
  readonly isWatched: () => boolean;

  // destroys the computer and any sandbox of an earlier release, so the next call makes an empty one
  readonly reset: () => Promise<void>;

  readonly tabs: ComputerTabs;

  readonly idleMs: number;
  readonly stop: () => Promise<void>;
}

const defaultTakeoverIdleMs = 30 * 60 * 1000;

const noTakeoverRecords: TakeoverRecords = {
  writeStarted: () => Promise.resolve(),
  writeEnded: () => Promise.resolve(),
};

const defaultHandoverExpiryMs = 60 * 60 * 1000;

const noHandoverRecords: HandoverRecords = {
  writeAsked: () => Promise.resolve(),
  writeClosed: () => Promise.resolve(),
};

const defaultTurnWaitMs = 60_000;
const defaultIdleMs = 30 * 60 * 1000;

export function startComputer(options: ComputerOptions): Computer {
  const state: DesktopState = {
    sandbox: null,
    guest: null,
    isAsleep: false,
    isMoved: false,
    turn: Promise.resolve(),
    holds: 0,
    idle: null,
    tabs: new Map(),
    tabCount: 0,
    idleClosed: new Set(),
    watches: { count: 0 },
    running: new Set(),
    admitted: new Set(),
    scope: new AsyncLocalStorage(),
    takeover: null,
  };

  const context: ComputerContext = { options, clock: options.clock ?? systemClock, state };

  const host: WatchHost = {
    watches: state.watches,
    logger: options.logger,
    hold: () => holdAwake(context, null),
    readGuest: (isEnded) => readWatchGuest(context, isEnded),
  };

  const hooks = makeGuestHooks({
    hasGuest: () => state.guest !== null,
    runHoldCall: (request) => runHoldCall(context, request),
    tabs: buildTabs(state),
  });

  const takeover = makeTakeover({
    clock: context.clock,
    logger: options.logger,
    idleMs: options.takeover?.idleMs ?? defaultTakeoverIdleMs,
    records: options.takeover?.records ?? noTakeoverRecords,
    keepAwake: () => holdAwake(context, null),
    waitForCalls: () => waitForRunningCalls({ running: state.running, clock: context.clock }),
    ...hooks,
  });

  state.takeover = takeover;

  const handover = makeHandover({
    clock: context.clock,
    logger: options.logger,
    records: options.handover?.records ?? noHandoverRecords,
    expiryMs: options.handover?.expiryMs ?? defaultHandoverExpiryMs,
    isHeld: takeover.isHeld,
  });

  return {
    call: (call) => runCall(context, call),
    settleMove: () => settleMove(context),
    hold: (forMs) => holdAwake(context, forMs),
    watch: (socket, deviceID) => watchAsDevice(host, takeover, socket, deviceID),
    takeover: {
      isHeld: takeover.isHeld,
      epoch: takeover.epoch,
      start: async (deviceID) => {
        const result = await takeover.start(deviceID);

        if (result.kind === 'started') {
          handover.answer();
        }

        return result;
      },
      end: takeover.end,
      admit: () =>
        admitRunningCall({
          ...state,
          clock: context.clock,
          isHeld: takeover.isHeld,
          turnWaitMs: options.turnWaitMs ?? defaultTurnWaitMs,
        }),
      isAdmitted: () => findAdmission(state) !== null,
    },
    handover,
    isWatched: () => state.watches.count > 0,
    reset: () => resetComputer(context),
    tabs: buildTabs(state),
    idleMs: options.idleMs ?? defaultIdleMs,

    // The hold of a server that stops ends at the next start, which writes its record.
    stop: () => {
      takeover.stop();
      handover.stop();

      state.takeover = null;

      return stopGuest(state);
    },
  };
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

  const release = await takeTurn(state, 0, context.clock);

  if (release === null) {
    return;
  }

  try {
    if (idle.signal.aborted || state.sandbox.suspension.kind !== 'memory') {
      return;
    }

    for (const tab of state.tabs.keys()) {
      state.idleClosed.add(tab);
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

// A guest that stops takes the desktop's windows with it, so a hold on it ends.
async function stopGuest(state: DesktopState): Promise<void> {
  const guest = state.guest;

  state.guest = null;

  state.tabs.clear();
  void state.takeover?.end('restart');

  if (guest !== null) {
    try {
      await guest.stream.stop();
    } catch {
      // a guest that is already gone has nothing to stop
    }
  }
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

  const release = await takeTurn(
    state,
    context.options.turnWaitMs ?? defaultTurnWaitMs,
    context.clock,
  );

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
    onClosed: () => {
      if (state.guest === guest) {
        void stopGuest(state);
      }
    },
  });

  state.guest = guest;

  state.tabs.clear();

  return guest;
}

// The hold's own calls to the guest take their turn as any call does, but no take-over waits for
// them, because they belong to the hold.
function runHoldCall(context: ComputerContext, request: ComputerCall['request']) {
  const scans = context.options.scans;

  return runInTurnOrBusy(context, { request, timeoutMs: 30_000, ...scans });
}

async function runInTurnOrBusy(
  context: ComputerContext,
  call: ComputerCall,
  onTurn?: () => void,
): Promise<CallResult> {
  const release = await takeTurn(
    context.state,
    context.options.turnWaitMs ?? defaultTurnWaitMs,
    context.clock,
  );

  if (release === null) {
    return { status: 'busy' };
  }

  onTurn?.();
  context.state.idle?.abort();

  try {
    return await runInTurn(context, call);
  } finally {
    release();
    scheduleSleep(context);
  }
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

// A call from a tool counts as running from the moment it asks for its turn, until it is answered,
// so a take-over waits for it. Its limit is the turn wait, and then its own timeout from the moment
// it takes the turn. A call inside an admission gives that admission the same limit.
function runCall(context: ComputerContext, call: ComputerCall): Promise<CallResult> {
  const state = context.state;
  const endsAtMs = context.clock.now() + (context.options.turnWaitMs ?? defaultTurnWaitMs);
  const calls = { running: state.running, admission: findAdmission(state) };

  return trackRunningCall(calls, endsAtMs, (moveLimit) =>
    runInTurnOrBusy(context, call, () => {
      moveLimit(context.clock.now() + call.timeoutMs);
    }),
  );
}

async function settleMove(context: ComputerContext): Promise<MoveGate> {
  if (context.state.isMoved) {
    return 'ready';
  }

  const release = await takeTurn(
    context.state,
    context.options.turnWaitMs ?? defaultTurnWaitMs,
    context.clock,
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

async function resetComputer(context: ComputerContext): Promise<void> {
  const state = context.state;

  state.idle?.abort();

  const release = await takeTurn(state, Number.POSITIVE_INFINITY, context.clock);

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
