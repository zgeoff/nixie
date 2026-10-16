import type { SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';

export interface ResultFields {
  isError: boolean;
  subtype: string;
  ttftStreamMs?: number;
}

// Keeps the fields of a turn's result that the report reads. A failed API request can end the
// turn with `subtype: 'success'` and `is_error: true`, so the row keeps both.
export function buildResultFields(message: SDKResultMessage): ResultFields {
  return {
    isError: message.is_error,
    subtype: message.subtype,
    ttftStreamMs: message.subtype === 'success' ? message.ttft_stream_ms : undefined,
  };
}
