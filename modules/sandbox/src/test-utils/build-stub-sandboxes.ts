import { join } from 'node:path';
import type { GuestFrame, HostFrame } from '@heynixie/wire';
import type { FileSpec, Sandbox, SandboxAdapter, SandboxSpec, SecretSpec } from '../types';
import type { StubGuestScript, StubSummaryScript } from './start-stub-guest';
import { startStubGuest } from './start-stub-guest';

type TurnFrame = Extract<HostFrame, { type: 'turn' }>;

type SummarizeFrame = Extract<HostFrame, { type: 'summarize' }>;

export interface StubSandboxes {
  readonly adapter: SandboxAdapter;
  readonly secrets: readonly SecretSpec[];
  readonly removedSecrets: readonly string[];
  readonly created: readonly SandboxSpec[];
  readonly destroyed: readonly string[];

  readonly turns: readonly TurnFrame[];

  readonly summaries: readonly SummarizeFrame[];

  readonly purged: readonly string[];

  readonly setGuestScript: (script: StubGuestScript) => void;

  readonly setSummaryScript: (script: StubSummaryScript) => void;

  readonly setPurgeAnswer: (frames: readonly GuestFrame[]) => void;

  // makes every later destroy reject, or restores it with null
  readonly setDestroyError: (error: Error | null) => void;
}

interface StubState {
  readonly secrets: SecretSpec[];
  readonly removedSecrets: string[];
  readonly created: SandboxSpec[];
  readonly destroyed: string[];
  readonly turns: TurnFrame[];
  readonly summaries: SummarizeFrame[];
  readonly purged: string[];
  readonly sandboxes: Sandbox[];
  script: StubGuestScript;
  summaryScript: StubSummaryScript;
  purgeAnswer: readonly GuestFrame[];
  destroyError: Error | null;
}

export function buildStubSandboxes(): StubSandboxes {
  const state: StubState = {
    secrets: [],
    removedSecrets: [],
    created: [],
    destroyed: [],
    turns: [],
    summaries: [],
    purged: [],
    sandboxes: [],
    script: buildHelloTurn,
    summaryScript: buildSummary,
    purgeAnswer: [{ type: 'purged' }],
    destroyError: null,
  };

  const buildSandbox = (spec: SandboxSpec): Sandbox => buildStubSandbox(spec, buildHooks(state));

  return {
    adapter: {
      id: 'stub',
      create: (spec) => {
        const sandbox = buildSandbox(spec);

        state.created.push(spec);
        state.sandboxes.push(sandbox);

        return Promise.resolve(sandbox);
      },
      read: (id) => Promise.resolve(getLive(state, (sandbox) => sandbox.id === id)[0] ?? null),
      list: (owner) => Promise.resolve(getLive(state, (sandbox) => sandbox.spec.owner === owner)),
      addSecret: (secret) => {
        state.secrets.push(secret);

        return Promise.resolve();
      },
      removeSecret: (name) => {
        state.removedSecrets.push(name);

        return Promise.resolve();
      },
      addImage: () => Promise.resolve(),
      checkRuntime: () => Promise.resolve({ isReady: true, reason: null }),
    },
    secrets: state.secrets,
    removedSecrets: state.removedSecrets,
    created: state.created,
    destroyed: state.destroyed,
    turns: state.turns,
    summaries: state.summaries,
    purged: state.purged,
    setGuestScript: (script) => {
      state.script = script;
    },
    setSummaryScript: (script) => {
      state.summaryScript = script;
    },
    setPurgeAnswer: (frames) => {
      state.purgeAnswer = frames;
    },
    setDestroyError: (error) => {
      state.destroyError = error;
    },
  };
}

function buildHelloTurn(turn: TurnFrame): readonly GuestFrame[] {
  return [
    { type: 'read', uuids: turn.input.map((message) => message.uuid) },
    { type: 'assistant', messageID: crypto.randomUUID(), text: 'Hello.', toolUses: [] },
    {
      type: 'ended',
      boundary: {
        harness: 'agent-sdk',
        sessionID: crypto.randomUUID(),
        messageID: crypto.randomUUID(),
      },
      outcome: 'finished',
      stopReason: 'end_turn',
      turns: 1,
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  ];
}

function buildSummary(): readonly GuestFrame[] {
  return [
    {
      type: 'summarized',
      boundary: {
        harness: 'agent-sdk',
        sessionID: crypto.randomUUID(),
        messageID: crypto.randomUUID(),
      },
      text: 'Open threads: none.',
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  ];
}

interface StubSandboxHooks {
  readonly onTurn: StubGuestScript;
  readonly onSummary: StubSummaryScript;
  readonly onDestroy: (id: string) => Promise<void>;
  readonly isDestroyed: (id: string) => boolean;
  readonly onPurge: (id: string) => readonly GuestFrame[];
}

function buildStubSandbox(spec: SandboxSpec, hooks: StubSandboxHooks): Sandbox {
  const id = crypto.randomUUID();

  return {
    id,
    spec,
    exec: requireSpawnOnly,
    spawn: () =>
      Promise.resolve(
        startStubGuest({
          onTurn: hooks.onTurn,
          onSummary: hooks.onSummary,
          onPurge: () => hooks.onPurge(id),
        }),
      ),
    ...buildStubFileOps(id, hooks),
    toolRoute: () => Promise.resolve({ url: 'http://127.0.0.1:8901' }),
    suspension: { kind: 'none' },
    readMemoryKills: () => Promise.resolve({ kind: 'unsupported' }),
    isRetired: false,
    destroy: () => hooks.onDestroy(id),
  };
}

function requireSpawnOnly(): Promise<never> {
  return Promise.reject(new Error('the stub sandbox only spawns the guest'));
}

// A stub sandbox keeps its files in memory, and refuses every file call once it is destroyed, so a
// test sees a copy that ran after the destroy.
function buildStubFileOps(
  id: string,
  hooks: StubSandboxHooks,
): Pick<Sandbox, 'copyIn' | 'copyOut' | 'resolveHome' | 'readFilePaths' | 'applyMove'> {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();

  const requireLive = (): void => {
    if (hooks.isDestroyed(id)) {
      throw new Error(`the stub sandbox ${id} is destroyed`);
    }
  };

  return {
    copyIn: (specs) =>
      Promise.try(() => {
        requireLive();

        for (const spec of specs) {
          files.set(spec.path, spec.content);
        }
      }),
    copyOut: (paths) =>
      Promise.try(() => {
        requireLive();

        return paths.map((path): FileSpec => {
          const content = files.get(path);

          if (content === undefined) {
            throw new Error(`ENOENT: no such file or directory, open '${path}'`);
          }

          return { path, content };
        });
      }),
    resolveHome: () =>
      Promise.try(() => {
        requireLive();

        return { copyPath: '/home/nixie', ownPath: '/home/nixie' };
      }),
    readFilePaths: (directory, options) =>
      Promise.try(() => {
        requireLive();

        const prefix = join(directory, '/');

        return [...files.keys()]
          .filter((path) => path.startsWith(prefix))
          .map((path) => path.slice(prefix.length))
          .filter(
            (path) => path.split('/').length <= (options?.maxDepth ?? Number.POSITIVE_INFINITY),
          );
      }),
    applyMove: (from, to) =>
      Promise.try(() => {
        requireLive();

        const content = files.get(from);

        if (content === undefined) {
          throw new Error(`ENOENT: no such file or directory, rename '${from}' -> '${to}'`);
        }

        files.delete(from);
        files.set(to, content);
      }),
  };
}

interface RecordingState {
  readonly turns: TurnFrame[];
  readonly summaries: SummarizeFrame[];
  readonly summaryScript: StubSummaryScript;
  readonly destroyed: string[];
  readonly purged: string[];
  readonly script: StubGuestScript;
  readonly purgeAnswer: readonly GuestFrame[];
  readonly destroyError: Error | null;
}

function buildHooks(state: RecordingState): StubSandboxHooks {
  return {
    onTurn: (turn, guest) => {
      state.turns.push(turn);

      return state.script(turn, guest);
    },
    onSummary: (frame) => {
      state.summaries.push(frame);

      return state.summaryScript(frame);
    },
    onDestroy: (id) => {
      if (state.destroyError !== null) {
        return Promise.reject(state.destroyError);
      }

      state.destroyed.push(id);

      return Promise.resolve();
    },
    isDestroyed: (id) => state.destroyed.includes(id),
    onPurge: (id) => {
      state.purged.push(id);

      return state.purgeAnswer;
    },
  };
}

interface StubSandboxState {
  readonly sandboxes: readonly Sandbox[];
  readonly destroyed: readonly string[];
}

function getLive(
  state: StubSandboxState,
  isMatch: (sandbox: Sandbox) => boolean,
): readonly Sandbox[] {
  return state.sandboxes.filter(
    (sandbox) => !state.destroyed.includes(sandbox.id) && isMatch(sandbox),
  );
}
