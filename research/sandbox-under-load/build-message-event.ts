import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { match, P } from 'ts-pattern';

export interface MessageEvent {
  readonly event: string;
  readonly fields: Record<string, unknown>;
}

// Each SDK release adds message types, so a type this spike does not log falls through to null.
export function buildMessageEvent(message: SDKMessage): MessageEvent | null {
  return (
    match(message)
      .with({ type: 'system', subtype: 'init' }, (init) => ({
        event: 'init',
        fields: {
          cli: init.claude_code_version,
          model: init.model,
          mcp: init.mcp_servers.map((server) => `${server.name}:${server.status}`),
          tools: init.tools,
        },
      }))
      .with({ type: 'system', subtype: 'api_retry' }, (retry) => ({
        event: 'api_retry',
        fields: {
          attempt: retry.attempt,
          maxRetries: retry.max_retries,
          retryDelayMs: retry.retry_delay_ms,
          status: retry.error_status,
          error: retry.error,
        },
      }))
      // The start and stop of each streamed response bracket one model request on the guest's clock.
      .with(
        { type: 'stream_event', event: { type: P.union('message_start', 'message_stop') } },
        (stream) => ({ event: stream.event.type, fields: {} }),
      )
      .with({ type: 'assistant' }, (assistant) => ({
        event: 'assistant',
        fields: {
          messageID: assistant.message.id,
          blocks: assistant.message.content.map((block) => block.type),
          toolUses: assistant.message.content.flatMap((block) =>
            block.type === 'tool_use' ? [{ id: block.id, name: block.name, input: block.input }] : [],
          ),
          ...(assistant.error === undefined ? {} : { error: assistant.error }),
        },
      }))
      .with({ type: 'user' }, (user) => ({
        event: 'tool_results',
        fields: {
          ids:
            typeof user.message.content === 'string'
              ? []
              : user.message.content.flatMap((block) =>
                  block.type === 'tool_result' ? [block.tool_use_id] : [],
                ),
        },
      }))
      .with({ type: 'result' }, (result) => ({
        event: 'result',
        fields: {
          subtype: result.subtype,
          isError: result.is_error,
          turns: result.num_turns,
          durationMs: result.duration_ms,
          apiMs: result.duration_api_ms,
          costUSD: result.total_cost_usd,
          ...(result.subtype === 'success' ? { text: result.result } : { errors: result.errors }),
        },
      }))
      .with({ type: 'system' }, (system) => ({ event: 'system', fields: { subtype: system.subtype } }))
      .otherwise(() => null)
  );
}
