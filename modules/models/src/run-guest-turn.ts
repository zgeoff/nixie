import type { ExecStream, Sandbox, StreamExit } from '@heynixie/sandbox';
import type { GuestFrame, HostFrame, InboxMessage } from '@heynixie/wire';
import {
  decodeTurnFrame,
  encodeTurnFrame,
  guestFrameSchema,
  turnFrameLimitBytes,
} from '@heynixie/wire';

// How the sandbox starts the conversation guest: its argv, and the variables it passes by name.
export interface GuestCommand {
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

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
}

// What the guest reported for one turn: each assistant message, the uuids of the inbox messages
// the model read, each model turn that ended at a result, and the failure that stopped it.
export interface GuestTurn {
  readonly assistants: readonly AssistantFrame[];
  readonly read: readonly string[];
  readonly ended: readonly EndedFrame[];
  readonly failure: FailedFrame | null;
}

// Runs one turn in the conversation guest: it starts the guest, sends the turn frame and then each
// live message, and collects the guest's frames until it exits. A guest that exits without ending
// or failing its turn, or that sends a frame the schema refuses, throws.
export async function runGuestTurn(spec: GuestTurnSpec): Promise<GuestTurn> {
  const stream = await spec.sandbox.spawn({
    argv: spec.command.argv,
    env: spec.command.env,
    maxMessageBytes: turnFrameLimitBytes,
  });
  const stopStream = () => {
    void stream.stop();
  };

  spec.signal.addEventListener('abort', stopStream, { once: true });
  try {
    await stream.send(encodeTurnFrame(spec.turn));
    void sendMessages(stream, spec.messages);
    return await collectTurn(stream);
  } catch (error) {
    await stream.stop();
    throw error;
  } finally {
    spec.signal.removeEventListener('abort', stopStream);
  }
}

// a message that comes after the guest stopped reading stays unread in the inbox for the next step
async function sendMessages(
  stream: ExecStream,
  messages: AsyncIterable<InboxMessage> | Iterable<InboxMessage>,
): Promise<void> {
  try {
    for await (const message of messages) {
      // oxlint-disable-next-line no-await-in-loop -- messages reach the guest in inbox order
      await stream.send(encodeTurnFrame({ type: 'message', message }));
    }
  } catch {
    // the guest has exited, and collectTurn reports how
  }
}

// the turn as collectTurn fills it in, frame by frame
interface MutableTurn {
  readonly assistants: AssistantFrame[];
  readonly read: string[];
  readonly ended: EndedFrame[];
  failure: FailedFrame | null;
}

async function collectTurn(stream: ExecStream): Promise<GuestTurn> {
  const turn: MutableTurn = { assistants: [], read: [], ended: [], failure: null };

  for await (const message of stream.messages) {
    updateTurn(turn, decodeTurnFrame(guestFrameSchema, message));
  }
  const exit = await stream.exit;

  requireTurnEnd(turn, exit);
  return turn;
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the turn this collects
function updateTurn(turn: MutableTurn, frame: GuestFrame): void {
  if (frame.type === 'assistant') {
    turn.assistants.push(frame);
  } else if (frame.type === 'read') {
    turn.read.push(...frame.uuids);
  } else if (frame.type === 'ended') {
    turn.ended.push(frame);
  } else {
    turn.failure = frame;
  }
}

function requireTurnEnd(turn: GuestTurn, exit: StreamExit): void {
  if (turn.ended.length > 0 || turn.failure !== null) {
    return;
  }
  const stderr = new TextDecoder().decode(exit.stderr.bytes);

  throw new Error(
    `the conversation guest exited with code ${exit.code} and signal ${exit.signal} before it ended its turn: ${stderr}`,
  );
}
