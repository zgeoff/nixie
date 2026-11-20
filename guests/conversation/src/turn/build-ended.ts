import type { SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import type { GuestFrame, SessionPoint } from '@heynixie/wire';
import { pickTurnOutcome } from './pick-turn-outcome';
import type { TurnState } from './turn-state';

export function buildEnded(
  message: SDKResultMessage,
  boundary: SessionPoint,
  state: TurnState,
): Extract<GuestFrame, { type: 'ended' }> {
  // The model API reports thinking tokens only in the result's usage, as the turn's total. The
  // per-message usage never carries them.
  const thinkingTokens =
    message.usage.output_tokens_details.thinking_tokens + state.carried.thinkingTokens;

  return {
    type: 'ended',
    outcome: pickTurnOutcome({
      subtype: message.subtype,
      terminalReason: message.terminal_reason,
      stopReason: message.stop_reason,
      isInterrupted: state.isInterrupted,
    }),
    boundary,
    stopReason: message.stop_reason,
    isError: message.is_error,
    ...(message.terminal_reason === undefined ? {} : { terminalReason: message.terminal_reason }),
    turns: message.num_turns + state.carried.turns,
    usage: {
      inputTokens: message.usage.input_tokens + state.carried.inputTokens,
      outputTokens: message.usage.output_tokens + state.carried.outputTokens,
      cacheReadTokens: message.usage.cache_read_input_tokens + state.carried.cacheReadTokens,
      cacheWriteTokens: message.usage.cache_creation_input_tokens + state.carried.cacheWriteTokens,
    },
    ...(thinkingTokens === 0 ? {} : { thinkingTokens }),
    ...(state.cutCalls === 0 ? {} : { cutCalls: state.cutCalls }),
    ...(state.contextSize === null
      ? {}
      : { context: { size: state.contextSize, window: state.compactWindow } }),
  };
}
