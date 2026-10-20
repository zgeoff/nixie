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
  // the recorder the adapter writes its sandboxes' lifecycle through, as a real adapter does
  readonly recorder: SandboxRecorder;

  // how the guest calls a tool the model asks for; a tool use with none fails the turn
  readonly callTool?: StubGuestToolCaller;

  // the tokens a text adds to the context, which each session entry's size and the context size
  // the guest reports come from
  readonly countTokens: (text: string) => number;

  // the host folder that holds each sandbox's own folder, as the process sandbox's root does: a
  // command with no HOME then has its home at the guest's root, which is that folder on the host;
  // with none, such a command has no home
  readonly hostRoot?: string;
}

// A host frame as one sandbox's guest received it.
export interface ReceivedFrame {
  readonly sandboxID: string;
  readonly frame: HostFrame;
}

export interface StubGuestSandboxes {
  readonly adapter: SandboxAdapter;

  // every host frame the guests received, in order
  readonly received: readonly ReceivedFrame[];
  readonly turns: readonly TurnFrame[];
  readonly summaries: readonly SummarizeFrame[];

  // the ID of the sandbox each purge frame reached, in order
  readonly purged: readonly string[];

  // the ID of each sandbox the adapter holds and has not destroyed
  readonly readSandboxIDs: () => readonly string[];

  // appends replies to the queue the guests answer from, one per model call, in order; a call past
  // the queue's end gets a default reply
  readonly addReplies: (...replies: readonly StubGuestReply[]) => void;

  // makes the next turn that ends reach this context size, in tokens, unless it already passed it
  readonly setContextSize: (tokens: number) => void;

  // the path of each file on any sandbox's disk whose text includes the text
  readonly collectFilesWithText: (text: string) => readonly string[];

  // removes every session from the disk of each sandbox the owner holds, as a sandbox that lost its
  // disk has none
  readonly removeSessions: (owner: string) => void;

  // makes each later copy out of the sandboxes the owner holds fail with this reason
  readonly failCopyOut: (owner: string, reason: string) => void;
}

const adapterID = 'stub-guest';
const defaultReply = 'Hello.';

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

// Builds a stand-in for the sandbox adapter whose sandboxes hold the state of a conversation guest.
// Each sandbox keeps its sessions as transcripts on a disk of its own, so a session reaches a
// replacement sandbox only through the host's copy. It speaks the real frames, with no process.
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
      get: async (id) => {
        const row = await options.recorder.findRow(adapterID, id);

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

function collectOwned(state: StubState, owner: string): readonly SandboxState[] {
  return [...state.sandboxes.values()].filter((own) => own.owner === owner);
}

// Writes the created record before it makes anything, as a real adapter does, then the grants.
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

interface SandboxRow {
  readonly sandboxID: string;
  readonly spec: SandboxSpec;
}

// the sandbox's state in the registry, with an empty disk registered for a sandbox it lacks, such
// as one a restarted adapter finds in the recorder
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

function buildSandbox(state: StubState, id: string, spec: SandboxSpec, own: SandboxState): Sandbox {
  // the process double refuses a call to a sleeping sandbox, so a test that forgets a wake fails
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

    // a list and a move run in the guest, as imp runs them, so a sleeping sandbox refuses them
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

interface GuestSandbox {
  readonly id: string;
  readonly spec: SandboxSpec;
  readonly own: SandboxState;
}

// the guest of one spawn: it records each frame it receives and answers from the sandbox's disk
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

          // a guest with no signal is one no host stops
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

// The HOME a command sets is the guest's home in both forms. A command with no HOME has its home at
// the guest's root, whose own path is the sandbox's folder under the host root; with no host root it
// has none.
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

// every file under the directory down to the depth, relative to it; the disk holds files only, so a
// directory is the prefix its files share
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

// a rename: it replaces a file at the target, and fails on a missing source or a directory target
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

function readFile(disk: StubGuestDisk, path: string): Promise<FileSpec> {
  const content = disk.files.get(path);

  return content === undefined
    ? Promise.reject(new Error(`ENOENT: no such file or directory, open '${path}'`))
    : Promise.resolve({ path, content });
}
