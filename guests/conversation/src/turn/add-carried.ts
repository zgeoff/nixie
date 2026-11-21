import type { SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import type { Carried } from './turn-state';

export function addCarried(carried: Carried, message: SDKResultMessage): Carried {
  return {
    inputTokens: carried.inputTokens + message.usage.input_tokens,
    outputTokens: carried.outputTokens + message.usage.output_tokens,
    cacheReadTokens: carried.cacheReadTokens + message.usage.cache_read_input_tokens,
    cacheWriteTokens: carried.cacheWriteTokens + message.usage.cache_creation_input_tokens,
    turns: carried.turns + message.num_turns,
    thinkingTokens: carried.thinkingTokens + message.usage.output_tokens_details.thinking_tokens,
  };
}
