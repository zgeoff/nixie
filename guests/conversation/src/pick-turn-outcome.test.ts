import { expect, test } from 'bun:test';
import { pickTurnOutcome } from './pick-turn-outcome';

test.each([
  {
    terminalReason: 'blocking_limit',
    subtype: 'success',
    stopReason: 'end_turn',
    isInterrupted: false,
    outcome: 'overflow',
  },
  {
    terminalReason: 'prompt_too_long',
    subtype: 'error_during_execution',
    stopReason: null,
    isInterrupted: false,
    outcome: 'overflow',
  },
  {
    terminalReason: 'prompt_too_long',
    subtype: 'error_max_turns',
    stopReason: null,
    isInterrupted: true,
    outcome: 'overflow',
  },
  {
    terminalReason: undefined,
    subtype: 'error_max_turns',
    stopReason: null,
    isInterrupted: false,
    outcome: 'limit',
  },
  {
    terminalReason: undefined,
    subtype: 'error_max_turns',
    stopReason: null,
    isInterrupted: true,
    outcome: 'limit',
  },
  {
    terminalReason: 'completed',
    subtype: 'success',
    stopReason: 'end_turn',
    isInterrupted: false,
    outcome: 'finished',
  },
  {
    terminalReason: 'completed',
    subtype: 'success',
    stopReason: 'end_turn',
    isInterrupted: true,
    outcome: 'finished',
  },
  {
    terminalReason: undefined,
    subtype: 'error_during_execution',
    stopReason: null,
    isInterrupted: true,
    outcome: 'interrupted',
  },
  {
    terminalReason: undefined,
    subtype: 'success',
    stopReason: 'tool_use',
    isInterrupted: true,
    outcome: 'interrupted',
  },
  {
    terminalReason: undefined,
    subtype: 'success',
    stopReason: 'refusal',
    isInterrupted: false,
    outcome: 'stopped',
  },
  {
    terminalReason: undefined,
    subtype: 'success',
    stopReason: 'max_tokens',
    isInterrupted: false,
    outcome: 'stopped',
  },
  {
    terminalReason: undefined,
    subtype: 'error_during_execution',
    stopReason: null,
    isInterrupted: false,
    outcome: 'stopped',
  },
] as const)(
  'it gives the outcome $outcome for terminal reason $terminalReason, result $subtype, stop reason $stopReason and interrupt $isInterrupted',
  (row) => {
    expect(pickTurnOutcome(row)).toBe(row.outcome);
  },
);
