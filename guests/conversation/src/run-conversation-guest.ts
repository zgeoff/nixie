import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import type { GuestFrame, HostFrame, InboxMessage } from '@heynixie/wire';
import {
  decodeTurnFrame,
  encodeFrame,
  encodeTurnFrame,
  hostFrameLimitBytes,
  hostFrameSchema,
  makeFrameDecoder,
} from '@heynixie/wire';
import type { TurnFrame } from './build-query-options';
import { getHome } from './get-home';
import { removeSessionState } from './remove-session-state';
import { runSummary } from './run-summary';
import { runTurn } from './run-turn';

export interface GuestIO {
  readonly input: AsyncIterable<Uint8Array> | Iterable<Uint8Array>;
  readonly write: (bytes: Uint8Array) => Promise<void>;
  readonly env: Readonly<Record<string, string | undefined>>;

  // builds nixie's tool server for the turn; production reaches the run's HTTP endpoint
  readonly buildToolServer?: (turn: TurnFrame) => McpServerConfig;

  // the pause before the turn's one reconnect to nixie's tool server
  readonly waitBeforeReconnect?: () => Promise<void>;
}

// Runs the conversation guest for one turn: the first host frame starts it, each later message
// frame goes into it, and its frames go out framed. A summarize frame in its place runs one summary
// call instead, and a purge frame removes the session state. A failure becomes a failed frame, so the host always learns how the run ended.
export async function runConversationGuest(io: GuestIO): Promise<void> {
  const frames = readHostFrames(io.input)[Symbol.asyncIterator]();
  const emit = (frame: GuestFrame) => io.write(encodeFrame(encodeTurnFrame(frame)));

  try {
    const first = await frames.next();

    if (first.done === true || first.value.type === 'message') {
      throw new Error('the first host frame must start a turn, a summary or a purge');
    }

    await runFirstFrame(first.value, { io, frames, emit });
  } catch (error) {
    await emit({ type: 'failed', reason: 'error', detail: String(error) });
  }
}

interface GuestRun {
  readonly io: GuestIO;
  readonly frames: AsyncIterator<HostFrame>;
  readonly emit: (frame: GuestFrame) => Promise<void>;
}

async function runFirstFrame(
  frame: Exclude<HostFrame, { type: 'message' }>,
  run: GuestRun,
): Promise<void> {
  if (frame.type === 'purge') {
    await removeSessionState(getHome(run.io.env));

    await run.emit({ type: 'purged' });

    return;
  }

  if (frame.type === 'summarize') {
    await runSummary(frame, { env: run.io.env, emit: run.emit });

    return;
  }

  await runTurn(frame, {
    env: run.io.env,
    toolServer: (run.io.buildToolServer ?? buildHTTPToolServer)(frame),
    messages: readMessages(run.frames),
    emit: run.emit,
    ...(run.io.waitBeforeReconnect === undefined
      ? {}
      : { waitBeforeReconnect: run.io.waitBeforeReconnect }),
  });
}

async function* readHostFrames(
  input: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
): AsyncGenerator<HostFrame> {
  const decode = makeFrameDecoder(hostFrameLimitBytes);

  for await (const chunk of input) {
    for (const message of decode(chunk)) {
      yield decodeTurnFrame(hostFrameSchema, message);
    }
  }
}

async function* readMessages(frames: AsyncIterator<HostFrame>): AsyncGenerator<InboxMessage> {
  for (;;) {
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
