import type { Harness } from '@heynixie/models';
import type { ExecStream, GuestCommand, Sandbox, StreamExit } from '@heynixie/sandbox';
import type { GuestFrame, HostFrame, ModelCallUsage } from '@heynixie/wire';
import {
  decodeTurnFrame,
  encodeHostFrame,
  guestFrameSchema,
  turnFrameLimitBytes,
} from '@heynixie/wire';
import type { LiveInboxMessage } from '../types';

type TurnFrame = Extract<HostFrame, { type: 'turn' }>;

export type AssistantFrame = Extract<GuestFrame, { type: 'assistant' }>;

type EndedFrame = Extract<GuestFrame, { type: 'ended' }>;

type FailedFrame = Extract<GuestFrame, { type: 'failed' }>;

interface GuestCallReplies {
  readonly text: string;
}

export interface GuestTurnSpec {
  readonly harness: Harness;
  readonly sandbox: Sandbox;
  readonly command: GuestCommand;
  readonly turn: TurnFrame;

  readonly messages: AsyncIterable<LiveInboxMessage> | Iterable<LiveInboxMessage>;

  readonly signal: AbortSignal;

  readonly interrupt?: AbortSignal;

  readonly readRecallMark?: () => Promise<number>;

  // runs on each model API call the guest reports, before the host reads the guest's next frame,
  // with the text of the replies the guest sent since the call before. The guest sends a call's
  // replies before the frame that reports the call.
  readonly onCall?: (usage: ModelCallUsage, replies: GuestCallReplies) => Promise<void>;

  // runs on each assistant frame, before the host reads the guest's next frame, and returns the
  // sequence of the reply it wrote for the frame, or null when it wrote none. A frame with an
  // error text never reaches it, and read holds the uuids the guest has reported so far.
  readonly onAssistant?: (frame: AssistantFrame, read: readonly string[]) => Promise<number | null>;
}

export interface GuestTurn {
  readonly assistants: readonly AssistantFrame[];
  readonly read: readonly string[];
  readonly ended: readonly EndedFrame[];
  readonly failure: FailedFrame | null;

  // the sequences of the replies that onAssistant wrote, in the order it wrote them
  readonly written: readonly number[];

  // how many of the written replies the last result frame settled: the replies after it belong to a
  // session that no turn resumes
  readonly settledWritten: number;

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

    // A frame the harness does not declare is a host contract violation: it sends nothing and fails
    // the turn. A guest that closed its stream fails a send quietly.
    const violation = Promise.withResolvers<never>();

    void reportViolation(sendMessages(stream, spec), violation);
    void reportViolation(sendInterrupt(stream, spec), violation);

    return await Promise.race([readTurn(stream, spec), violation.promise]);
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

async function reportViolation(
  sending: Promise<void>,
  violation: PromiseWithResolvers<never>,
): Promise<void> {
  try {
    await sending;
  } catch (error) {
    violation.reject(error);
  }
}

async function sendMessages(
  stream: ExecStream,
  spec: Pick<GuestTurnSpec, 'harness' | 'messages'>,
): Promise<void> {
  for await (const live of spec.messages) {
    const bytes = encodeHostFrame(spec.harness.capabilities, {
      type: 'message',
      message: live.message,
      ...(live.cutsCall ? { cutsCall: true as const } : {}),
    });

    try {
      await stream.send(bytes);
    } catch {
      return;
    }
  }
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
    const bytes = encodeHostFrame(spec.harness.capabilities, { type: 'interrupt' });

    try {
      await stream.send(bytes);
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
  readonly written: number[];
  endedMark: number | null;
  settled: { readonly assistants: number; readonly read: number; readonly written: number };
}

// The SDK resumes a session at its last result, so a reply or a read after that result belongs to a
// session that no turn resumes. Its inbox records stay unread, and the next step sends them again.
async function readTurn(
  stream: ExecStream,
  spec: Pick<GuestTurnSpec, 'harness' | 'readRecallMark' | 'onCall' | 'onAssistant'>,
): Promise<GuestTurn> {
  const turn: MutableTurn = {
    assistants: [],
    read: [],
    ended: [],
    failure: null,
    written: [],
    endedMark: null,
    settled: { assistants: 0, read: 0, written: 0 },
  };

  let repliedThrough = 0;

  for await (const message of stream.messages) {
    const frame = decodeTurnFrame(guestFrameSchema, message);

    if (frame.type === 'call') {
      const replies = turn.assistants.slice(repliedThrough);

      repliedThrough = turn.assistants.length;

      await spec.onCall?.(frame.usage, {
        text: replies.map((reply) => reply.text).join('\n\n'),
      });

      continue;
    }

    const mark = await readFrameMark(frame, spec.readRecallMark);

    updateTurn(turn, frame, mark, spec.harness);

    if (frame.type === 'assistant' && frame.isError !== true) {
      const sequence = await spec.onAssistant?.(frame, turn.read);

      if (sequence !== undefined && sequence !== null) {
        turn.written.push(sequence);
      }
    }
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
    written: turn.written,
    settledWritten: turn.settled.written,
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

    turn.settled = {
      assistants: turn.assistants.length,
      read: turn.read.length,
      written: turn.written.length,
    };
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
