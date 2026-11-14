import type { Harness } from '@heynixie/models';
import type { ExecStream, GuestCommand, Sandbox, StreamExit } from '@heynixie/sandbox';
import type { GuestFrame, HostFrame, InboxMessage, ModelCallUsage } from '@heynixie/wire';
import {
  decodeTurnFrame,
  encodeHostFrame,
  guestFrameSchema,
  turnFrameLimitBytes,
} from '@heynixie/wire';

type TurnFrame = Extract<HostFrame, { type: 'turn' }>;

type AssistantFrame = Extract<GuestFrame, { type: 'assistant' }>;

type EndedFrame = Extract<GuestFrame, { type: 'ended' }>;

type FailedFrame = Extract<GuestFrame, { type: 'failed' }>;

export interface GuestTurnSpec {
  readonly harness: Harness;
  readonly sandbox: Sandbox;
  readonly command: GuestCommand;
  readonly turn: TurnFrame;

  readonly messages: AsyncIterable<InboxMessage> | Iterable<InboxMessage>;

  readonly signal: AbortSignal;

  readonly interrupt?: AbortSignal;

  readonly readRecallMark?: () => Promise<number>;

  // runs on each model API call the guest reports, before the host reads the guest's next frame
  readonly onCall?: (usage: ModelCallUsage) => Promise<void>;
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

    await stream.send(encodeHostFrame(spec.harness.capabilities, spec.turn));

    void sendMessages(stream, spec);
    void sendInterrupt(stream, spec);

    return await readTurn(stream, spec);
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

async function sendMessages(
  stream: ExecStream,
  spec: Pick<GuestTurnSpec, 'harness' | 'messages'>,
): Promise<void> {
  try {
    for await (const message of spec.messages) {
      await stream.send(encodeHostFrame(spec.harness.capabilities, { type: 'message', message }));
    }
  } catch {}
}

// A guest that already ended its turn takes no frame, so a late interrupt fails quietly.
async function sendInterrupt(
  stream: ExecStream,
  spec: Pick<GuestTurnSpec, 'harness' | 'interrupt' | 'signal'>,
): Promise<void> {
  if (spec.interrupt === undefined) {
    return;
  }

  const interrupted = await waitForAbort(spec.interrupt, spec.signal);

  if (interrupted) {
    try {
      await stream.send(encodeHostFrame(spec.harness.capabilities, { type: 'interrupt' }));
    } catch {}
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

// The SDK resumes a session at its last result, so a reply or a read after that result belongs to a
// session that no turn resumes. Its inbox records stay unread, and the next step sends them again.
async function readTurn(
  stream: ExecStream,
  spec: Pick<GuestTurnSpec, 'harness' | 'readRecallMark' | 'onCall'>,
): Promise<GuestTurn> {
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

    if (frame.type === 'call') {
      await spec.onCall?.(frame.usage);

      continue;
    }

    const mark = await readFrameMark(frame, spec.readRecallMark);

    updateTurn(turn, frame, mark, spec.harness);
  }

  const exit = await stream.exit;

  requireTurnEnd(turn, exit, spec.harness);

  return {
    // A failed turn resumes no session, so it keeps every reply the model gave before it failed.
    assistants:
      turn.failure === null ? turn.assistants.slice(0, turn.settled.assistants) : turn.assistants,
    read: turn.read.slice(0, turn.settled.read),
    ended: turn.ended,
    failure: turn.failure,
    ...(turn.endedMark === null ? {} : { endedMark: turn.endedMark }),
  };
}

type MarkReader = GuestTurnSpec['readRecallMark'];

function readFrameMark(frame: GuestFrame, readRecallMark: MarkReader): Promise<number | undefined> {
  return frame.type === 'ended' && readRecallMark !== undefined
    ? readRecallMark()
    : Promise.resolve(undefined);
}

type TurnStateFrame = Exclude<GuestFrame, { type: 'call' }>;

function updateTurn(
  turn: MutableTurn,
  frame: TurnStateFrame,
  mark: number | undefined,
  harness: Harness,
): void {
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
    throw new Error(`the ${harness.guest.package} guest reported a purge during a turn`);
  }
}

function requireTurnEnd(
  turn: Pick<GuestTurn, 'ended' | 'failure'>,
  exit: StreamExit,
  harness: Harness,
): void {
  if (turn.ended.length > 0 || turn.failure !== null) {
    return;
  }

  const stderr = new TextDecoder().decode(exit.stderr.bytes);

  throw new Error(
    `the ${harness.guest.package} guest exited with code ${exit.code} and signal ${exit.signal} before it ended its turn: ${stderr}`,
  );
}
