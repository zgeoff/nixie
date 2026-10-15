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

  // inbox messages that arrive while the turn runs, which go into it as they come
  readonly messages: AsyncIterable<InboxMessage> | Iterable<InboxMessage>;

  // aborts when the step's lease is lost, which stops the guest
  readonly signal: AbortSignal;

  // read at each ended frame, so the turn reports the mark its last result saw
  readonly readRecallMark?: () => Promise<number>;
}

// What the guest reported for one turn: each assistant message, the uuids of the inbox messages
// the model read, each model turn that ended at a result, and the failure that stopped it.
export interface GuestTurn {
  readonly assistants: readonly AssistantFrame[];
  readonly read: readonly string[];
  readonly ended: readonly EndedFrame[];
  readonly failure: FailedFrame | null;

  // the mark read at the last ended frame, when the spec reads one
  readonly endedMark?: number;
}

// Runs one turn in the conversation guest: it starts the guest, sends the turn frame and then each
// live message, and collects the guest's frames until it exits. A guest that exits without ending
// or failing its turn, or that sends a frame the schema refuses, throws.
// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a sandbox handle and an async iterable have no readonly form
export async function runGuestTurn(spec: GuestTurnSpec): Promise<GuestTurn> {
  const stream = await spec.sandbox.spawn({
    argv: spec.command.argv,
    env: spec.command.env,
    maxMessageBytes: turnFrameLimitBytes,
  });

  const unsubscribe = subscribeToAbort(spec.signal, stream);

  try {
    // a signal that aborted while the guest started never fires its listener
    spec.signal.throwIfAborted();

    await stream.send(encodeTurnFrame(spec.turn));

    void sendMessages(stream, spec.messages);

    return await collectTurn(stream, spec.readRecallMark);
  } catch (error) {
    await stream.stop();

    throw error;
  } finally {
    unsubscribe();
  }
}

// stops the guest when the signal aborts, until the returned function detaches it
// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a stream handle has no readonly form
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

// a message that comes after the guest stopped reading stays unread in the inbox for the next step
// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a stream handle and an async iterable have no readonly form
async function sendMessages(stream: ExecStream, messages: LiveMessages): Promise<void> {
  try {
    for await (const message of messages) {
      await stream.send(encodeTurnFrame({ type: 'message', message }));
    }
  } catch {
    // the guest has exited, and collectTurn reports how
  }
}

// the turn as collectTurn fills it in, frame by frame, with the count of assistant frames and read
// uuids that came before its last ended frame
interface MutableTurn {
  readonly assistants: AssistantFrame[];
  readonly read: string[];
  readonly ended: EndedFrame[];
  failure: FailedFrame | null;
  endedMark: number | null;
  settled: { readonly assistants: number; readonly read: number };
}

type MarkReader = GuestTurnSpec['readRecallMark'];

// Only the frames up to the last ended frame count, because the next turn resumes at that frame's
// boundary: a reply or a read after it, from a guest that died before its next result, belongs to a
// session no turn resumes, so its inbox records stay unread and the next step sends them again.
// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a stream handle has no readonly form
async function collectTurn(stream: ExecStream, readRecallMark: MarkReader): Promise<GuestTurn> {
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

// the newest recall at an ended frame, read before the turn moves past it
function readFrameMark(frame: GuestFrame, readRecallMark: MarkReader): Promise<number | undefined> {
  return frame.type === 'ended' && readRecallMark !== undefined
    ? readRecallMark()
    : Promise.resolve(undefined);
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the turn this collects
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
