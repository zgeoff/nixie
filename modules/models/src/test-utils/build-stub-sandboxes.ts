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

// The stub guest's side of one turn: the messages the host sent into it, one at a time.
export interface StubGuest {
  readonly waitForMessage: () => Promise<InboxMessage>;
}

// Answers one turn frame with the guest frames the stub sends back before it exits.
export type StubGuestScript = (
  turn: TurnFrame,
  guest: StubGuest,
) => Promise<readonly GuestFrame[]> | readonly GuestFrame[];

export interface StubSandboxes {
  readonly adapter: SandboxAdapter;
  readonly secrets: readonly SecretSpec[];
  readonly created: readonly SandboxSpec[];
  readonly destroyed: readonly string[];

  // every turn frame the guests received, in order
  readonly turns: readonly TurnFrame[];

  // sets how the guest of each later spawn answers its turn
  readonly setGuestScript: (script: StubGuestScript) => void;
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

// Builds a stand-in for the sandbox adapter whose sandboxes run a scripted conversation guest. It
// speaks the real turn frames over a framed stream, as the guest does, so the host side runs as it
// would against a sandbox, with no process and no model.
export function buildStubSandboxes(): StubSandboxes {
  const state = {
    secrets: [] as SecretSpec[],
    created: [] as SandboxSpec[],
    destroyed: [] as string[],
    turns: [] as TurnFrame[],
    sandboxes: [] as Sandbox[],
    script: buildHelloTurn as StubGuestScript,
  };
  const buildSandbox = (spec: SandboxSpec): Sandbox =>
    buildStubSandbox(spec, {
      onTurn: (turn, guest) => {
        state.turns.push(turn);
        return state.script(turn, guest);
      },
      onDestroy: (id) => {
        state.destroyed.push(id);
      },
    });

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
    },
    secrets: state.secrets,
    created: state.created,
    destroyed: state.destroyed,
    turns: state.turns,
    setGuestScript: (script) => {
      state.script = script;
    },
  };
}

interface StubSandboxState {
  readonly sandboxes: readonly Sandbox[];
  readonly destroyed: readonly string[];
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
  readonly onDestroy: (id: string) => void;
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
    spawn: () => Promise.resolve(startStubGuest(hooks.onTurn)),
    copyIn: requireSpawnOnly,
    copyOut: requireSpawnOnly,
    toolRoute: () => Promise.resolve({ url: 'http://127.0.0.1:8901' }),
    suspension: { kind: 'none' },
    destroy: () => {
      hooks.onDestroy(id);
      return Promise.resolve();
    },
  };
}

const noStderr = { bytes: new Uint8Array(0), totalBytes: 0, isCut: false };

function startStubGuest(onTurn: StubGuestScript): ExecStream {
  const output = new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>();
  const writer = output.writable.getWriter();
  const exit = Promise.withResolvers<StreamExit>();
  const inbox = buildMessageQueue();
  const stopGuest = async (ended: StreamExit) => {
    await writer.close().catch(() => {});
    exit.resolve(ended);
  };
  const runScript = async (turn: TurnFrame) => {
    const frames = await onTurn(turn, { waitForMessage: inbox.wait });

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
