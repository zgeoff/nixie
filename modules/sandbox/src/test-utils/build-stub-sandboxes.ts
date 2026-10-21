import type { GuestFrame, HostFrame } from '@heynixie/wire';
import type { Sandbox, SandboxAdapter, SandboxSpec, SecretSpec } from '../types';
import type { StubGuestScript, StubSummaryScript } from './start-stub-guest';
import { startStubGuest } from './start-stub-guest';

type TurnFrame = Extract<HostFrame, { type: 'turn' }>;

type SummarizeFrame = Extract<HostFrame, { type: 'summarize' }>;

export interface StubSandboxes {
  readonly adapter: SandboxAdapter;
  readonly secrets: readonly SecretSpec[];
  readonly created: readonly SandboxSpec[];
  readonly destroyed: readonly string[];

  readonly turns: readonly TurnFrame[];

  readonly summaries: readonly SummarizeFrame[];

  readonly purged: readonly string[];

  readonly setGuestScript: (script: StubGuestScript) => void;

  readonly setSummaryScript: (script: StubSummaryScript) => void;

  readonly setPurgeAnswer: (frames: readonly GuestFrame[]) => void;
}

interface StubState {
  readonly secrets: SecretSpec[];
  readonly created: SandboxSpec[];
  readonly destroyed: string[];
  readonly turns: TurnFrame[];
  readonly summaries: SummarizeFrame[];
  readonly purged: string[];
  readonly sandboxes: Sandbox[];
  script: StubGuestScript;
  summaryScript: StubSummaryScript;
  purgeAnswer: readonly GuestFrame[];
}

export function buildStubSandboxes(): StubSandboxes {
  const state: StubState = {
    secrets: [],
    created: [],
    destroyed: [],
    turns: [],
    summaries: [],
    purged: [],
    sandboxes: [],
    script: buildHelloTurn,
    summaryScript: buildSummary,
    purgeAnswer: [{ type: 'purged' }],
  };

  const buildSandbox = (spec: SandboxSpec): Sandbox => buildStubSandbox(spec, buildHooks(state));

  return {
    adapter: {
      id: 'stub',
      boundary: 'process',
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
      addImage: () => Promise.resolve(),
      checkRuntime: () => Promise.resolve({ isReady: true, reason: null }),
    },
    secrets: state.secrets,
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
  };
}

function buildHelloTurn(turn: TurnFrame): readonly GuestFrame[] {
  return [
    { type: 'read', uuids: turn.input.map((message) => message.uuid) },
    { type: 'assistant', messageID: crypto.randomUUID(), text: 'Hello.', toolUses: [] },
    {
      type: 'ended',
      boundary: { sessionID: crypto.randomUUID(), messageID: crypto.randomUUID() },
      subtype: 'success',
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
      boundary: { sessionID: crypto.randomUUID(), messageID: crypto.randomUUID() },
      text: 'Open threads: none.',
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  ];
}

interface StubSandboxHooks {
  readonly onTurn: StubGuestScript;
  readonly onSummary: StubSummaryScript;
  readonly onDestroy: (id: string) => void;
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
    copyIn: requireSpawnOnly,
    copyOut: requireSpawnOnly,
    resolveHome: requireSpawnOnly,
    readFilePaths: requireSpawnOnly,
    applyMove: requireSpawnOnly,
    toolRoute: () => Promise.resolve({ url: 'http://127.0.0.1:8901' }),
    suspension: { kind: 'none' },
    isRetired: false,
    destroy: () => {
      hooks.onDestroy(id);

      return Promise.resolve();
    },
  };
}

function requireSpawnOnly(): Promise<never> {
  return Promise.reject(new Error('the stub sandbox only spawns the guest'));
}

interface RecordingState {
  readonly turns: TurnFrame[];
  readonly summaries: SummarizeFrame[];
  readonly summaryScript: StubSummaryScript;
  readonly destroyed: string[];
  readonly purged: string[];
  readonly script: StubGuestScript;
  readonly purgeAnswer: readonly GuestFrame[];
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
      state.destroyed.push(id);
    },
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
