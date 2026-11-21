import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { TurnState } from './turn-state';

type StreamEventMessage = Extract<SDKMessage, { type: 'stream_event' }>;

export function trackStreaming(message: StreamEventMessage, state: TurnState): void {
  if (message.parent_tool_use_id !== null) {
    return;
  }

  if (message.event.type === 'message_start') {
    state.isStreaming = true;
    state.hasToolUse = false;
  } else if (message.event.type === 'message_stop') {
    state.isStreaming = false;
  } else if (
    message.event.type === 'content_block_start' &&
    message.event.content_block.type === 'tool_use'
  ) {
    state.hasToolUse = true;
  }
}
