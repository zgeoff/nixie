// Reads one Agent SDK message into what a voice turn acts on: reply text as it streams, the tools
// the model called, and the turn's result. A failed API request can end the turn with
// `subtype: 'success'` and `is_error: true`, so the result keeps both.
import { match } from 'ts-pattern';
import { z } from 'zod';
import type { ResultFields } from './build-result-fields.ts';

export type SessionMessage =
  | { kind: 'ignored' }
  | { fields: ResultFields; kind: 'result'; totalCostUSD: number }
  | { kind: 'text'; text: string }
  | { kind: 'tool-calls'; names: string[] };

const sessionMessage = z.discriminatedUnion('type', [
  z.object({
    // A subagent's stream carries its parent's tool use ID, and only the reply itself is spoken.
    event: z.object({
      delta: z.object({ text: z.string(), type: z.literal('text_delta') }),
      type: z.literal('content_block_delta'),
    }),
    parent_tool_use_id: z.null(),
    type: z.literal('stream_event'),
  }),
  z.object({
    message: z.object({ content: z.array(z.object({ name: z.string().optional(), type: z.string() })) }),
    type: z.literal('assistant'),
  }),
  z.object({
    is_error: z.boolean(),
    subtype: z.string(),
    total_cost_usd: z.number(),
    ttft_stream_ms: z.number().optional(),
    type: z.literal('result'),
  }),
]);

export function parseSessionMessage(raw: unknown): SessionMessage {
  const parsed = sessionMessage.safeParse(raw);
  if (!parsed.success) {
    return { kind: 'ignored' };
  }
  return match(parsed.data)
    .returnType<SessionMessage>()
    .with({ type: 'stream_event' }, (message) => ({ kind: 'text', text: message.event.delta.text }))
    .with({ type: 'assistant' }, (message) => ({
      kind: 'tool-calls',
      names: message.message.content.flatMap((block) =>
        block.type === 'tool_use' && block.name !== undefined ? [block.name] : [],
      ),
    }))
    .with({ type: 'result' }, (message) => ({
      fields: {
        isError: message.is_error,
        subtype: message.subtype,
        ttftStreamMs: message.subtype === 'success' ? message.ttft_stream_ms : undefined,
      },
      kind: 'result',
      totalCostUSD: message.total_cost_usd,
    }))
    .exhaustive();
}
