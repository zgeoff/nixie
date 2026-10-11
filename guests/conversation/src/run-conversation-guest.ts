import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import type { GuestFrame, HostFrame, InboxMessage } from '@heynixie/wire';
import {
  decodeTurnFrame,
  encodeFrame,
  encodeTurnFrame,
  hostFrameSchema,
  makeFrameDecoder,
  turnFrameLimitBytes,
} from '@heynixie/wire';
import type { TurnFrame } from './build-query-options';
import { runTurn } from './run-turn';

export interface GuestIO {
  readonly input: AsyncIterable<Uint8Array> | Iterable<Uint8Array>;
  readonly write: (bytes: Uint8Array) => Promise<void>;
  readonly env: Readonly<Record<string, string | undefined>>;

  // builds nixie's tool server for the turn; production reaches the run's HTTP endpoint
  readonly buildToolServer?: (turn: TurnFrame) => McpServerConfig;
}

// Runs the conversation guest for one turn: the first host frame starts it, each later message
// frame goes into it, and its frames go out framed. A failure becomes a failed frame, so the host
// always learns how the turn ended.
export async function runConversationGuest(io: GuestIO): Promise<void> {
  const frames = readHostFrames(io.input)[Symbol.asyncIterator]();
  const emit = (frame: GuestFrame) => io.write(encodeFrame(encodeTurnFrame(frame)));

  try {
    const first = await frames.next();

    if (first.done === true || first.value.type !== 'turn') {
      throw new Error('the first host frame must start a turn');
    }
    const turn = first.value;

    await runTurn(turn, {
      env: io.env,
      toolServer: (io.buildToolServer ?? buildHTTPToolServer)(turn),
      messages: readMessages(frames),
      emit,
    });
  } catch (error) {
    await emit({ type: 'failed', reason: 'error', detail: String(error) });
  }
}

async function* readHostFrames(
  input: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
): AsyncGenerator<HostFrame> {
  const decode = makeFrameDecoder(turnFrameLimitBytes);

  for await (const chunk of input) {
    for (const message of decode(chunk)) {
      yield decodeTurnFrame(hostFrameSchema, message);
    }
  }
}

async function* readMessages(frames: AsyncIterator<HostFrame>): AsyncGenerator<InboxMessage> {
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- frames arrive one at a time
    const next = await frames.next();

    if (next.done === true) {
      return;
    }
    if (next.value.type !== 'message') {
      throw new Error('a turn is already running');
    }
    yield next.value.message;
  }
}

// The run's Streamable HTTP endpoint behind its bearer token. alwaysLoad holds the CLI's start
// until the server connects, so init shows its real status and the first prompt lists its tools.
function buildHTTPToolServer(turn: TurnFrame): McpServerConfig {
  return {
    type: 'http',
    url: new URL('/mcp', turn.tools.url).href,
    headers: { authorization: `Bearer ${turn.tools.token}` },
    alwaysLoad: true,
  };
}
