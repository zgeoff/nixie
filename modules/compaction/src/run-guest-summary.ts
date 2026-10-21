import type { ExecStream, GuestCommand, Sandbox } from '@heynixie/sandbox';
import type { GuestFrame, HostFrame } from '@heynixie/wire';
import {
  decodeTurnFrame,
  encodeTurnFrame,
  guestFrameSchema,
  turnFrameLimitBytes,
} from '@heynixie/wire';

type SummarizeFrame = Extract<HostFrame, { type: 'summarize' }>;

export type GuestSummary = Extract<GuestFrame, { type: 'summarized' }>;

export interface GuestSummarySpec {
  readonly sandbox: Sandbox;
  readonly command: GuestCommand;
  readonly frame: SummarizeFrame;

  readonly signal: AbortSignal;
}

export async function runGuestSummary(spec: GuestSummarySpec): Promise<GuestSummary> {
  const stream = await spec.sandbox.spawn({
    argv: spec.command.argv,
    env: spec.command.env,
    maxMessageBytes: turnFrameLimitBytes,
  });

  const unsubscribe = subscribeToAbort(spec.signal, stream);

  try {
    // An AbortSignal that aborted before the listener attached never fires it.
    spec.signal.throwIfAborted();

    const frames = await readSummaryFrames(stream, spec.frame);

    spec.signal.throwIfAborted();

    return await requireSummary(stream, frames);
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

async function readSummaryFrames(
  stream: ExecStream,
  frame: SummarizeFrame,
): Promise<readonly GuestFrame[]> {
  const frames: GuestFrame[] = [];

  await stream.send(encodeTurnFrame(frame));

  for await (const message of stream.messages) {
    frames.push(decodeTurnFrame(guestFrameSchema, message));
  }

  return frames;
}

async function requireSummary(
  stream: ExecStream,
  frames: readonly GuestFrame[],
): Promise<GuestSummary> {
  const summary = frames.find((frame) => frame.type === 'summarized');

  if (summary?.type === 'summarized') {
    return summary;
  }

  const failed = frames.find((frame) => frame.type === 'failed');

  const exit = await stream.exit;

  const detail =
    failed?.type === 'failed'
      ? `${failed.reason}: ${failed.detail}`
      : new TextDecoder().decode(exit.stderr.bytes);

  throw new Error(`the summary call failed: ${detail}`);
}
