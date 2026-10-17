import type { ExecStream, GuestCommand, Sandbox } from '@heynixie/sandbox';
import type { GuestFrame } from '@heynixie/wire';
import {
  decodeTurnFrame,
  encodeTurnFrame,
  guestFrameSchema,
  turnFrameLimitBytes,
} from '@heynixie/wire';

export interface GuestPurgeSpec {
  readonly sandbox: Sandbox;
  readonly command: GuestCommand;
}

// Runs the conversation guest once to remove its session state, every transcript and fork, and
// waits for it to report the state gone and exit. A guest that exits without that report throws,
// so the forget stays pending and runs the cleanup again.
export async function runGuestPurge(spec: GuestPurgeSpec): Promise<void> {
  const stream = await spec.sandbox.spawn({
    argv: spec.command.argv,
    env: spec.command.env,
    maxMessageBytes: turnFrameLimitBytes,
  });

  const frames = await collectPurgeFrames(stream);
  const exit = await stream.exit;

  if (!frames.some((frame) => frame.type === 'purged')) {
    const failed = frames.find((frame) => frame.type === 'failed');

    const stderr = new TextDecoder().decode(exit.stderr.bytes);

    throw new Error(
      `the conversation guest did not remove its session state: ${failed?.detail ?? stderr}`,
    );
  }
}

async function collectPurgeFrames(stream: ExecStream): Promise<readonly GuestFrame[]> {
  const frames: GuestFrame[] = [];

  try {
    await stream.send(encodeTurnFrame({ type: 'purge' }));

    for await (const message of stream.messages) {
      frames.push(decodeTurnFrame(guestFrameSchema, message));
    }
  } catch (error) {
    await stream.stop();

    throw error;
  }

  return frames;
}
