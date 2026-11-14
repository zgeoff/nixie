import type { GuestFrame } from '@heynixie/wire';

type EndedFrame = Extract<GuestFrame, { type: 'ended' }>;

export function isContextOverflow(frame: Pick<EndedFrame, 'outcome'>): boolean {
  return frame.outcome === 'overflow';
}
