import type { TurnOutcome } from '@heynixie/wire';
import { isOverflowReason } from './is-overflow-reason';

export interface TurnOutcomeInput {
  // the result message's subtype
  readonly subtype: string;
  readonly terminalReason: string | undefined;
  readonly stopReason: string | null;
  readonly isInterrupted: boolean;
}

// The first matching row wins, so a finished turn that also met an interrupt is finished.
export function pickTurnOutcome(input: TurnOutcomeInput): TurnOutcome {
  if (isOverflowReason(input.terminalReason)) {
    return 'overflow';
  }

  if (input.subtype === 'error_max_turns') {
    return 'limit';
  }

  if (input.subtype === 'success' && input.stopReason === 'end_turn') {
    return 'finished';
  }

  // The CLI ends a turn on a tool result that asks for it, so the last call's stop reason is
  // tool_use and the turn ran to its end.
  if (
    input.subtype === 'success' &&
    input.stopReason === 'tool_use' &&
    input.terminalReason === 'completed'
  ) {
    return 'finished';
  }

  return input.isInterrupted ? 'interrupted' : 'stopped';
}
