import type {
  ExecStream,
  Sandbox,
  SandboxAdapter,
  SandboxSpec,
  SecretSpec,
  StreamExit,
} from '@heynixie/sandbox';
import type { GuestFrame, HostFrame, InboxMessage } from '@heynixie/wire';
import { decodeTurnFrame, encodeTurnFrame, hostFrameSchema } from '@heynixie/wire';

type TurnFrame = Extract<HostFrame, { type: 'turn' }>;

type SummarizeFrame = Extract<HostFrame, { type: 'summarize' }>;

// The stub guest's side of one turn: the messages the host sent into it, one at a time.
interface StubGuest {
  readonly waitForMessage: () => Promise<InboxMessage>;
}

// Answers one turn frame with the guest frames the stub sends back before it exits.
export type StubGuestScript = (
  turn: TurnFrame,
  guest: StubGuest,
) => Promise<readonly GuestFrame[]> | readonly GuestFrame[];

// Answers one summarize frame with the guest frames the stub sends back before it exits.
type StubSummaryScript = (
  frame: SummarizeFrame,
) => Promise<readonly GuestFrame[]> | readonly GuestFrame[];

export interface StubSandboxes {
  readonly adapter: SandboxAdapter;
  readonly secrets: readonly SecretSpec[];
  readonly created: readonly SandboxSpec[];
  readonly destroyed: readonly string[];

  // every turn frame the guests received, in order
  readonly turns: readonly TurnFrame[];

  // every summarize frame the guests received, in order
  readonly summaries: readonly SummarizeFrame[];

  // the ID of the sandbox each purge frame reached, in order
  readonly purged: readonly string[];

  // sets how the guest of each later spawn answers its turn
  readonly setGuestScript: (script: StubGuestScript) => void;

  // sets how the guest of each later spawn answers a summarize frame
  readonly setSummaryScript: (script: StubSummaryScript) => void;

  // sets the frames the guest of each later spawn answers a purge frame with, purged by default
  readonly setPurgeAnswer: (frames: readonly GuestFrame[]) => void;
}

// The stub guest's script until a test sets one: it reads every inbox message, answers Hello. and
// ends the turn at a new chain entry.
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

// The stub guest's summary until a test sets one: a short summary at a new chain entry.
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

// Builds a stand-in for the sandbox adapter whose sandboxes run a scripted conversation guest. It
// speaks the real turn frames over a framed stream, as the guest does, so the host side runs as it
// would against a sandbox, with no process and no model.
export function buildStubSandboxes(): StubSandboxes {
  const state = {
    secrets: [] as SecretSpec[],
    created: [] as SandboxSpec[],
    destroyed: [] as string[],
    turns: [] as TurnFrame[],
    summaries: [] as SummarizeFrame[],
    purged: [] as string[],
    sandboxes: [] as Sandbox[],
    script: buildHelloTurn as StubGuestScript,
    summaryScript: buildSummary as StubSummaryScript,
    purgeAnswer: [{ type: 'purged' }] as readonly GuestFrame[],
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
      get: (id) => Promise.resolve(findLive(state, (sandbox) => sandbox.id === id)[0] ?? null),
      list: (owner) => Promise.resolve(findLive(state, (sandbox) => sandbox.spec.owner === owner)),
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

interface StubSandboxState {
  readonly sandboxes: readonly Sandbox[];
  readonly destroyed: readonly string[];
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

// each sandbox records what reaches it in the stub's state, and runs the script set at the time
// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the stub's own state, which the hooks fill in
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

function findLive(
  state: StubSandboxState,
  isMatch: (sandbox: Sandbox) => boolean,
): readonly Sandbox[] {
  return state.sandboxes.filter(
    (sandbox) => !state.destroyed.includes(sandbox.id) && isMatch(sandbox),
  );
}

interface StubSandboxHooks {
  readonly onTurn: StubGuestScript;
  readonly onSummary: StubSummaryScript;
  readonly onDestroy: (id: string) => void;
  readonly onPurge: (id: string) => readonly GuestFrame[];
}

// the stub runs the guest and nothing else
function requireSpawnOnly(): Promise<never> {
  return Promise.reject(new Error('the stub sandbox only spawns the guest'));
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
    toolRoute: () => Promise.resolve({ url: 'http://127.0.0.1:8901' }),
    suspension: { kind: 'none' },
    isRetired: false,
    destroy: () => {
      hooks.onDestroy(id);

      return Promise.resolve();
    },
  };
}

const noStderr = { bytes: new Uint8Array(0), totalBytes: 0, isCut: false };

interface StubGuestHooks {
  readonly onTurn: StubGuestScript;
  readonly onSummary: StubSummaryScript;
  readonly onPurge: () => readonly GuestFrame[];
}

// the stub guest answers a turn frame and a summarize frame with their scripts, and a purge frame as the guest does once it
// has removed its session state
function startStubGuest(hooks: StubGuestHooks): ExecStream {
  const output = new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>();

  const writer = output.writable.getWriter();
  const exit = Promise.withResolvers<StreamExit>();
  const inbox = buildMessageQueue();

  const stopGuest = async (ended: StreamExit) => {
    await writer.close().catch(() => {});

    exit.resolve(ended);
  };

  const runScript = async (first: Exclude<HostFrame, { type: 'message' }>) => {
    const frames = await runFirstFrame(hooks, first, { waitForMessage: inbox.wait });

    for (const frame of frames) {
      // oxlint-disable-next-line no-await-in-loop -- frames reach the host in order
      await writer.write(encodeTurnFrame(frame));
    }

    await stopGuest({ code: 0, signal: null, stderr: noStderr });
  };

  return {
    messages: output.readable,
    send: (bytes) => {
      const frame = decodeTurnFrame(hostFrameSchema, bytes);

      if (frame.type === 'message') {
        inbox.push(frame.message);
      } else {
        void runScript(frame);
      }

      return Promise.resolve();
    },
    exit: exit.promise,
    stop: async () => {
      await stopGuest({ code: null, signal: 'SIGTERM', stderr: noStderr });

      return exit.promise;
    },
  };
}

function runFirstFrame(
  hooks: StubGuestHooks,
  first: Exclude<HostFrame, { type: 'message' }>,
  guest: StubGuest,
): Promise<readonly GuestFrame[]> | readonly GuestFrame[] {
  if (first.type === 'purge') {
    return hooks.onPurge();
  }

  if (first.type === 'summarize') {
    return hooks.onSummary(first);
  }

  return hooks.onTurn(first, guest);
}

function buildMessageQueue(): {
  readonly push: (message: InboxMessage) => void;
  readonly wait: () => Promise<InboxMessage>;
} {
  const queued: InboxMessage[] = [];
  const waiting: ((message: InboxMessage) => void)[] = [];

  return {
    push: (message) => {
      const waiter = waiting.shift();

      if (waiter === undefined) {
        queued.push(message);
      } else {
        waiter(message);
      }
    },
    wait: () => {
      const message = queued.shift();

      if (message !== undefined) {
        return Promise.resolve(message);
      }

      const next = Promise.withResolvers<InboxMessage>();

      waiting.push(next.resolve);

      return next.promise;
    },
  };
}
