import type { ExecStream, Sandbox } from '@heynixie/sandbox';
import type { GuestFrame, HostFrame } from '@heynixie/wire';
import {
  decodeTurnFrame,
  encodeTurnFrame,
  guestFrameSchema,
  turnFrameLimitBytes,
} from '@heynixie/wire';
import type { GuestCommand } from './run-guest-turn';

type SummarizeFrame = Extract<HostFrame, { type: 'summarize' }>;

export type GuestSummary = Extract<GuestFrame, { type: 'summarized' }>;

export interface GuestSummarySpec {
  readonly sandbox: Sandbox;
  readonly command: GuestCommand;
  readonly frame: SummarizeFrame;

  // aborts when the step's lease is lost or a forget invalidates the session, which stops the guest
  readonly signal: AbortSignal;
}

// Runs the conversation guest once for one summary call and returns the summary. A guest that
// reports a failure, or exits without a summary, throws with what it reported.
export async function runGuestSummary(spec: GuestSummarySpec): Promise<GuestSummary> {
  spec.signal.throwIfAborted();

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
    const frames = await collectSummaryFrames(stream, spec.frame);

    spec.signal.throwIfAborted();

    return await requireSummary(stream, frames);
  } finally {
    spec.signal.removeEventListener('abort', stopStream);
  }
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a stream handle has no readonly form
async function collectSummaryFrames(
  stream: ExecStream,
  frame: SummarizeFrame,
): Promise<readonly GuestFrame[]> {
  const frames: GuestFrame[] = [];

  try {
    await stream.send(encodeTurnFrame(frame));

    for await (const message of stream.messages) {
      frames.push(decodeTurnFrame(guestFrameSchema, message));
    }
  } catch (error) {
    await stream.stop();

    throw error;
  }

  return frames;
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a stream handle has no readonly form
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
