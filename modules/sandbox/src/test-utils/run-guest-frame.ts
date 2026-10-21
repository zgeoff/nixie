import type { GuestFrame, HostFrame } from '@heynixie/wire';
import { decodeTurnFrame, encodeTurnFrame, guestFrameSchema } from '@heynixie/wire';
import type { Sandbox } from '../types';

type EndedFrame = Extract<GuestFrame, { type: 'ended' }>;

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

  await stream.send(encodeTurnFrame(frame));

  const messages = await Array.fromAsync(stream.messages);

  const frames = messages.map((message) => decodeTurnFrame(guestFrameSchema, message));

  return { frames, ended: frames.find((guestFrame) => guestFrame.type === 'ended') ?? null };
}
