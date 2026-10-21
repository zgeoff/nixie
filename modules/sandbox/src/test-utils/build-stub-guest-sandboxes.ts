import { join } from 'node:path';
import type { GuestFrame, HostFrame } from '@heynixie/wire';
import { createSandboxID } from '../create-sandbox-id';
import { requireSandboxSpec } from '../require-sandbox-spec';
import type {
  FileSpec,
  GuestHome,
  Sandbox,
  SandboxAdapter,
  SandboxRecorder,
  SandboxSpec,
} from '../types';
import type { StubGuestDisk } from './build-stub-guest-disk';
import { buildStubGuestDisk } from './build-stub-guest-disk';
import { runStubGuestSummary } from './run-stub-guest-summary';
import type { StubGuestReply, StubGuestToolCaller } from './run-stub-guest-turn';
import { runStubGuestTurn } from './run-stub-guest-turn';
import { startStubGuest } from './start-stub-guest';

type TurnFrame = Extract<HostFrame, { type: 'turn' }>;

type SummarizeFrame = Extract<HostFrame, { type: 'summarize' }>;

export interface StubGuestSandboxesOptions {
  readonly recorder: SandboxRecorder;

  readonly callTool?: StubGuestToolCaller;

  readonly countTokens: (text: string) => number;

  readonly hostRoot?: string;
}

export interface ReceivedFrame {
  readonly sandboxID: string;
  readonly frame: HostFrame;
}

export interface StubGuestSandboxes {
  readonly adapter: SandboxAdapter;

  readonly received: readonly ReceivedFrame[];
  readonly turns: readonly TurnFrame[];
  readonly summaries: readonly SummarizeFrame[];

  readonly purged: readonly string[];

  readonly readSandboxIDs: () => readonly string[];

  readonly addReplies: (...replies: readonly StubGuestReply[]) => void;

  readonly setContextSize: (tokens: number) => void;

  readonly collectFilesWithText: (text: string) => readonly string[];

  readonly removeSessions: (owner: string) => void;

  readonly failCopyOut: (owner: string, reason: string) => void;
}

const adapterID = 'stub-guest';

interface SandboxState {
  readonly owner: string;
  readonly disk: StubGuestDisk;
  isAsleep: boolean;
  copyOutFailure: string | null;
}

interface StubState {
  readonly options: StubGuestSandboxesOptions;
  readonly sandboxes: Map<string, SandboxState>;
  readonly received: ReceivedFrame[];
  readonly turns: TurnFrame[];
  readonly summaries: SummarizeFrame[];
  readonly purged: string[];
  readonly replies: StubGuestReply[];
  contextSize: number | null;
}

export function buildStubGuestSandboxes(options: StubGuestSandboxesOptions): StubGuestSandboxes {
  const state: StubState = {
    options,
    sandboxes: new Map(),
    received: [],
    turns: [],
    summaries: [],
    purged: [],
    replies: [],
    contextSize: null,
  };

  return {
    adapter: {
      id: adapterID,
      boundary: 'process',
      create: (spec) => createSandbox(state, spec),
      read: async (id) => {
        const row = await options.recorder.readRow(adapterID, id);

        return row === null
          ? null
          : buildSandbox(state, row.sandboxID, row.spec, registerSandboxState(state, row));
      },
      list: async (owner) => {
        const rows = await options.recorder.list(adapterID, owner);

        return rows.map((row) =>
          buildSandbox(state, row.sandboxID, row.spec, registerSandboxState(state, row)),
        );
      },
      addSecret: () => Promise.resolve(),
      addImage: () => Promise.resolve(),
      checkRuntime: () => Promise.resolve({ isReady: true, reason: null }),
    },
    received: state.received,
    turns: state.turns,
    summaries: state.summaries,
    purged: state.purged,
    readSandboxIDs: () => [...state.sandboxes.keys()],
    addReplies: (...replies) => {
      state.replies.push(...replies);
    },
    setContextSize: (tokens) => {
      state.contextSize = tokens;
    },
    collectFilesWithText: (text) =>
      [...state.sandboxes.values()].flatMap((own) =>
        [...own.disk.files]
          .filter(([, content]) => new TextDecoder().decode(content).includes(text))
          .map(([path]) => path),
      ),
    removeSessions: (owner) => {
      for (const own of collectOwned(state, owner)) {
        own.disk.removeAllSessions();
      }
    },
    failCopyOut: (owner, reason) => {
      for (const own of collectOwned(state, owner)) {
        own.copyOutFailure = reason;
      }
    },
  };
}

async function createSandbox(state: StubState, spec: SandboxSpec): Promise<Sandbox> {
  requireSandboxSpec(spec);

  const id = createSandboxID();

  await state.options.recorder.write({ event: 'created', sandboxID: id, adapter: adapterID, spec });

  for (const grant of spec.grants) {
    await state.options.recorder.write({
      event: 'granted',
      sandboxID: id,
      secret: grant.secret,
      host: grant.host,
    });
  }

  return buildSandbox(state, id, spec, registerSandboxState(state, { sandboxID: id, spec }));
}

function buildSandbox(state: StubState, id: string, spec: SandboxSpec, own: SandboxState): Sandbox {
  const requireAwake = () => {
    if (own.isAsleep) {
      return Promise.reject(new Error(`sandbox ${id} is asleep`));
    }

    return Promise.resolve();
  };

  return {
    id,
    spec,
    exec: () => Promise.reject(new Error('the stub sandbox runs no command')),
    spawn: async (command) => {
      await requireAwake();

      const home = findGuestHome(state.options.hostRoot, id, command.env ?? {});

      return startGuest(state, { id, spec, own }, home);
    },
    copyIn: (files) => {
      for (const file of files) {
        own.disk.files.set(file.path, file.content);
      }

      return Promise.resolve();
    },
    copyOut: (paths) => {
      if (own.copyOutFailure !== null) {
        return Promise.reject(new Error(own.copyOutFailure));
      }

      return Promise.all(paths.map((path) => readFile(own.disk, path)));
    },
    resolveHome: (env) => Promise.try(() => resolveHome(state.options.hostRoot, id, env)),

    readFilePaths: async (directory, options) => {
      await requireAwake();

      return collectDiskPaths(own.disk, directory, options?.maxDepth ?? Number.POSITIVE_INFINITY);
    },
    applyMove: async (from, to) => {
      await requireAwake();

      applyMove(own.disk, from, to);
    },
    toolRoute: () => Promise.resolve({ url: 'http://127.0.0.1:8901' }),
    suspension: {
      kind: 'memory',
      sleep: async () => {
        own.isAsleep = true;

        await state.options.recorder.write({ event: 'slept', sandboxID: id });
      },
      wake: async () => {
        own.isAsleep = false;

        await state.options.recorder.write({ event: 'woken', sandboxID: id });
      },
    },
    destroy: async () => {
      state.sandboxes.delete(id);

      await state.options.recorder.write({
        event: 'destroyed',
        sandboxID: id,
        reason: 'destroyed',
      });
    },
    isRetired: false,
  };
}

function findGuestHome(
  hostRoot: string | undefined,
  id: string,
  env: Readonly<Record<string, string>>,
): GuestHome | null {
  const home = env['HOME'];

  if (home !== undefined) {
    return { copyPath: home, ownPath: home };
  }

  return hostRoot === undefined ? null : { copyPath: '/', ownPath: join(hostRoot, id) };
}

interface GuestSandbox {
  readonly id: string;
  readonly spec: SandboxSpec;
  readonly own: SandboxState;
}

const defaultReply = 'Hello.';

function startGuest(state: StubState, sandbox: GuestSandbox, home: GuestHome | null) {
  const runWithGuestHome = (
    run: (home: GuestHome) => Promise<readonly GuestFrame[]> | readonly GuestFrame[],
  ) =>
    home === null
      ? [{ type: 'failed', reason: 'error', detail: 'the conversation guest needs HOME' } as const]
      : run(home);

  return startStubGuest({
    onFrame: (frame) => {
      state.received.push({ sandboxID: sandbox.id, frame });

      if (frame.type === 'turn') {
        state.turns.push(frame);
      } else if (frame.type === 'summarize') {
        state.summaries.push(frame);
      } else if (frame.type === 'purge') {
        state.purged.push(sandbox.id);
      }
    },
    onTurn: (turn, guest) =>
      runWithGuestHome((guestHome) =>
        runStubGuestTurn(turn, {
          sandboxID: sandbox.id,
          owner: sandbox.spec.owner,
          disk: sandbox.own.disk,
          home: guestHome,
          takeReply: () => state.replies.shift() ?? { text: defaultReply },
          takeContextSize: () => {
            const size = state.contextSize;

            state.contextSize = null;

            return size;
          },
          callTool: state.options.callTool,
          countTokens: state.options.countTokens,
          takeMessage: () => guest.takeMessage?.(),
          ...(guest.emit === undefined ? {} : { emit: guest.emit }),

          signal: guest.signal ?? new AbortController().signal,
        }),
      ),
    onSummary: (frame) =>
      runWithGuestHome((guestHome) =>
        runStubGuestSummary(frame, {
          disk: sandbox.own.disk,
          home: guestHome,
          countTokens: state.options.countTokens,
        }),
      ),
    onPurge: () =>
      runWithGuestHome((guestHome) => {
        sandbox.own.disk.removeState(guestHome);

        return [{ type: 'purged' }];
      }),
  });
}

function readFile(disk: StubGuestDisk, path: string): Promise<FileSpec> {
  const content = disk.files.get(path);

  return content === undefined
    ? Promise.reject(new Error(`ENOENT: no such file or directory, open '${path}'`))
    : Promise.resolve({ path, content });
}

function resolveHome(
  hostRoot: string | undefined,
  id: string,
  env: Readonly<Record<string, string>>,
): GuestHome {
  const home = findGuestHome(hostRoot, id, env);

  if (home === null) {
    throw new Error('the guest command sets no HOME');
  }

  return home;
}

function collectDiskPaths(
  disk: StubGuestDisk,
  directory: string,
  maxDepth: number,
): readonly string[] {
  const prefix = join(directory, '/');

  return [...disk.files.keys()]
    .filter((path) => path.startsWith(prefix))
    .map((path) => path.slice(prefix.length))
    .filter((path) => path.split('/').length <= maxDepth);
}

function applyMove(disk: StubGuestDisk, from: string, to: string): void {
  const content = disk.files.get(from);

  if (content === undefined) {
    throw new Error(`ENOENT: no such file or directory, rename '${from}' -> '${to}'`);
  }

  if ([...disk.files.keys()].some((path) => path.startsWith(`${to}/`))) {
    throw new Error(`EISDIR: illegal operation on a directory, rename '${from}' -> '${to}'`);
  }

  disk.files.delete(from);
  disk.files.set(to, content);
}

interface SandboxRow {
  readonly sandboxID: string;
  readonly spec: SandboxSpec;
}

function registerSandboxState(state: StubState, row: SandboxRow): SandboxState {
  const registered = state.sandboxes.get(row.sandboxID);

  if (registered !== undefined) {
    return registered;
  }

  const own = {
    owner: row.spec.owner,
    disk: buildStubGuestDisk(),
    isAsleep: false,
    copyOutFailure: null,
  };

  state.sandboxes.set(row.sandboxID, own);

  return own;
}

function collectOwned(state: StubState, owner: string): readonly SandboxState[] {
  return [...state.sandboxes.values()].filter((own) => own.owner === owner);
}
