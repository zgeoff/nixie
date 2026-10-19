import type { GuestFrame, HostFrame } from '@heynixie/wire';
import { decodeTurnFrame, encodeTurnFrame, guestFrameSchema } from '@heynixie/wire';
import type { Sandbox } from '../types';

type EndedFrame = Extract<GuestFrame, { type: 'ended' }>;

export interface GuestFrameRun {
  // every frame the guest answered with, in order
  readonly frames: readonly GuestFrame[];

  // the first ended frame, which a turn that works always sends, or null when the guest sent none
  readonly ended: EndedFrame | null;
}

const defaultEnv = { HOME: '/home/nixie' };

// Runs one guest on the sandbox: it sends the frame, then reads every frame the guest answers with
// until the guest ends its output. The guest's HOME is /home/nixie unless the env given says
// otherwise.
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
