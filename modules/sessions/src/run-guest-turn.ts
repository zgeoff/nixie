import type { ExecStream, GuestCommand, Sandbox, StreamExit } from '@heynixie/sandbox';
import type { GuestFrame, HostFrame, InboxMessage } from '@heynixie/wire';
import {
  decodeTurnFrame,
  encodeTurnFrame,
  guestFrameSchema,
  turnFrameLimitBytes,
} from '@heynixie/wire';

type TurnFrame = Extract<HostFrame, { type: 'turn' }>;

type AssistantFrame = Extract<GuestFrame, { type: 'assistant' }>;

type EndedFrame = Extract<GuestFrame, { type: 'ended' }>;

type FailedFrame = Extract<GuestFrame, { type: 'failed' }>;

export interface GuestTurnSpec {
  readonly sandbox: Sandbox;
  readonly command: GuestCommand;
  readonly turn: TurnFrame;

  readonly messages: AsyncIterable<InboxMessage> | Iterable<InboxMessage>;

  readonly signal: AbortSignal;

  readonly interrupt?: AbortSignal;

  readonly readRecallMark?: () => Promise<number>;
}

export interface GuestTurn {
  readonly assistants: readonly AssistantFrame[];
  readonly read: readonly string[];
  readonly ended: readonly EndedFrame[];
  readonly failure: FailedFrame | null;

  readonly endedMark?: number;
}

export async function runGuestTurn(spec: GuestTurnSpec): Promise<GuestTurn> {
  const stream = await spec.sandbox.spawn({
    argv: spec.command.argv,
    env: spec.command.env,
    maxMessageBytes: turnFrameLimitBytes,
  });

  const unsubscribe = subscribeToAbort(spec.signal, stream);

  try {
    // An AbortSignal fires no abort listener added after it aborted.
    spec.signal.throwIfAborted();

    await stream.send(encodeTurnFrame(spec.turn));

    void sendMessages(stream, spec.messages);
    void sendInterrupt(stream, spec.interrupt, spec.signal);

    return await readTurn(stream, spec.readRecallMark);
  } catch (error) {
    await stream.stop();

    throw error;
  } finally {
    unsubscribe();
  }
}

function subscribeToAbort(signal: AbortSignal, stream: ExecStream): () => void {
  const stopStream = () => {
    void stream.stop();
  };

  signal.addEventListener('abort', stopStream, { once: true });

  return () => {
    signal.removeEventListener('abort', stopStream);
  };
}

type LiveMessages = GuestTurnSpec['messages'];

async function sendMessages(stream: ExecStream, messages: LiveMessages): Promise<void> {
  try {
    for await (const message of messages) {
      await stream.send(encodeTurnFrame({ type: 'message', message }));
    }
  } catch {}
}

// A guest that already ended its turn takes no frame, so a late interrupt fails quietly.
async function sendInterrupt(
  stream: ExecStream,
  interrupt: AbortSignal | undefined,
  signal: AbortSignal,
): Promise<void> {
  if (interrupt === undefined) {
    return;
  }

  const interrupted = await waitForAbort(interrupt, signal);

  if (interrupted) {
    await stream.send(encodeTurnFrame({ type: 'interrupt' })).catch(() => {});
  }
}

function waitForAbort(interrupt: AbortSignal, signal: AbortSignal): Promise<boolean> {
  if (interrupt.aborted) {
    return Promise.resolve(true);
  }

  const settled = Promise.withResolvers<boolean>();

  interrupt.addEventListener(
    'abort',
    () => {
      settled.resolve(true);
    },
    { once: true },
  );

  signal.addEventListener(
    'abort',
    () => {
      settled.resolve(false);
    },
    { once: true },
  );

  return settled.promise;
}

interface MutableTurn {
  readonly assistants: AssistantFrame[];
  readonly read: string[];
  readonly ended: EndedFrame[];
  failure: FailedFrame | null;
  endedMark: number | null;
  settled: { readonly assistants: number; readonly read: number };
}

type MarkReader = GuestTurnSpec['readRecallMark'];

// The SDK resumes a session at its last result, so a reply or a read after that result belongs to a
// session that no turn resumes. Its inbox records stay unread, and the next step sends them again.
async function readTurn(stream: ExecStream, readRecallMark: MarkReader): Promise<GuestTurn> {
  const turn: MutableTurn = {
    assistants: [],
    read: [],
    ended: [],
    failure: null,
    endedMark: null,
    settled: { assistants: 0, read: 0 },
  };

  for await (const message of stream.messages) {
    const frame = decodeTurnFrame(guestFrameSchema, message);

    const mark = await readFrameMark(frame, readRecallMark);

    updateTurn(turn, frame, mark);
  }

  const exit = await stream.exit;

  requireTurnEnd(turn, exit);

  return {
    assistants: turn.assistants.slice(0, turn.settled.assistants),
    read: turn.read.slice(0, turn.settled.read),
    ended: turn.ended,
    failure: turn.failure,
    ...(turn.endedMark === null ? {} : { endedMark: turn.endedMark }),
  };
}

function readFrameMark(frame: GuestFrame, readRecallMark: MarkReader): Promise<number | undefined> {
  return frame.type === 'ended' && readRecallMark !== undefined
    ? readRecallMark()
    : Promise.resolve(undefined);
}

function updateTurn(turn: MutableTurn, frame: GuestFrame, mark: number | undefined): void {
  if (frame.type === 'assistant') {
    turn.assistants.push(frame);
  } else if (frame.type === 'read') {
    turn.read.push(...frame.uuids);
  } else if (frame.type === 'ended') {
    turn.ended.push(frame);

    turn.endedMark = mark ?? null;
    turn.settled = { assistants: turn.assistants.length, read: turn.read.length };
  } else if (frame.type === 'failed') {
    turn.failure = frame;
  } else {
    throw new Error('the conversation guest reported a purge during a turn');
  }
}

function requireTurnEnd(turn: Pick<GuestTurn, 'ended' | 'failure'>, exit: StreamExit): void {
  if (turn.ended.length > 0 || turn.failure !== null) {
    return;
  }

  const stderr = new TextDecoder().decode(exit.stderr.bytes);

  throw new Error(
    `the conversation guest exited with code ${exit.code} and signal ${exit.signal} before it ended its turn: ${stderr}`,
  );
}
