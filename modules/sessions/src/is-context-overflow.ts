import type { GuestFrame } from '@heynixie/wire';

type EndedFrame = Extract<GuestFrame, { type: 'ended' }>;

// The Agent SDK reports blocking_limit when the CLI refuses the next call itself, and
// prompt_too_long when the model API refuses it.
const overflowReasons: ReadonlySet<string> = new Set(['blocking_limit', 'prompt_too_long']);

export function isContextOverflow(frame: Pick<EndedFrame, 'terminalReason'>): boolean {
  return frame.terminalReason !== undefined && overflowReasons.has(frame.terminalReason);
}
