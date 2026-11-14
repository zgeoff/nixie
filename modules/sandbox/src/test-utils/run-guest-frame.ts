import type { GuestFrame, HostFrame, SessionPoint } from '@heynixie/wire';
import {
  decodeTurnFrame,
  encodeHostFrame,
  guestFrameSchema,
  harnessCapabilities,
} from '@heynixie/wire';
import type { Sandbox } from '../types';

// The stub guest runs the Agent SDK's loop, so its turn end always carries a session point.
type EndedFrame = Extract<GuestFrame, { type: 'ended' }> & { readonly boundary: SessionPoint };

export interface GuestFrameRun {
  readonly frames: readonly GuestFrame[];

  readonly ended: EndedFrame | null;
}

const defaultEnv = { HOME: '/home/nixie' };

export async function runGuestFrame(
  sandbox: Sandbox,
  frame: HostFrame,
  env: Readonly<Record<string, string>> = defaultEnv,
): Promise<GuestFrameRun> {
  const stream = await sandbox.spawn({ argv: ['guest'], env, maxMessageBytes: 1 << 20 });

  await stream.send(encodeHostFrame(harnessCapabilities['agent-sdk'], frame));

  const messages = await Array.fromAsync(stream.messages);

  const frames = messages.map((message) => decodeTurnFrame(guestFrameSchema, message));

  return { frames, ended: frames.find((guestFrame) => isKeptEnd(guestFrame)) ?? null };
}

function isKeptEnd(frame: GuestFrame): frame is EndedFrame {
  return frame.type === 'ended' && frame.boundary !== undefined;
}
