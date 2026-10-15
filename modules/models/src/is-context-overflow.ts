import type { GuestFrame } from '@heynixie/wire';

type EndedFrame = Extract<GuestFrame, { type: 'ended' }>;

// the SDK's reasons for a turn whose context passed the window: blocking_limit when the CLI refused
// the next call itself, and prompt_too_long when the model API refused it
const overflowReasons: ReadonlySet<string> = new Set(['blocking_limit', 'prompt_too_long']);

// Whether a turn ended because its context passed the window, rather than at any other model API
// error. A frame from a guest that sends no reason reads as no overflow.
export function isContextOverflow(frame: Pick<EndedFrame, 'terminalReason'>): boolean {
  return frame.terminalReason !== undefined && overflowReasons.has(frame.terminalReason);
}
