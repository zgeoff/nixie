import type { JSONObject, LogRecord } from '@heynixie/log';
import { JSON_OBJECT_SCHEMA } from '@heynixie/log';
import { taskMessageCodec } from '@heynixie/tasks';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { sessionEventSchema } from '../source/session-event-schema';
import type { SessionEvent } from '../types';

export type InboxItem =
  | {
      readonly kind: 'outcome';
      readonly sequence: number;
      readonly actionID: string;
      readonly tool: string;
      readonly status: 'done' | 'failed' | 'unknown' | 'cancelled';
      readonly result: JSONObject | null;

      // the provider's message, else the queue's reason
      readonly reason: string;
    }
  | {
      readonly kind: 'message';
      readonly sequence: number;

      // null for a message of the user's
      readonly messageID: string | null;
      readonly from: string | null;
      readonly body: string;
      readonly hop: number;

      // the brief that the start wrote as the task's first message
      readonly isBrief: boolean;
    }
  | { readonly kind: 'event'; readonly sequence: number; readonly event: SessionEvent | null }
  | { readonly kind: 'other'; readonly sequence: number };

const outcomePayloadSchema = z.object({
  actionID: z.string(),
  tool: z.string(),
  status: z.enum(['done', 'failed', 'unknown', 'cancelled']),
  reason: z.string().nullable(),
});

const outcomeFieldsSchema = z.object({
  result: JSON_OBJECT_SCHEMA.optional(),
  message: z.string().optional(),
});

// What the coding step reads of one record of its inbox. A record whose text a forget erased reads
// as empty text.
export function toInboxItem(record: LogRecord): InboxItem {
  const fields = record.erasable.status === 'readable' ? record.erasable.fields : {};

  return match(record.kind)
    .returnType<InboxItem>()
    .with('action.outcome', () => {
      const outcome = outcomePayloadSchema.parse(record.payload);
      const details = outcomeFieldsSchema.parse(fields);

      return {
        kind: 'outcome',
        sequence: record.sequence,
        actionID: outcome.actionID,
        tool: outcome.tool,
        status: outcome.status,
        result: details.result ?? null,
        reason: details.message ?? outcome.reason ?? outcome.status,
      };
    })
    .with('task_message', () => {
      const message = taskMessageCodec.decode(record.payload);

      return {
        kind: 'message',
        sequence: record.sequence,
        messageID: message.messageID,
        from: message.from,
        body: getText(fields, 'body'),
        hop: message.hop,
        isBrief: message.hop === 0,
      };
    })
    .with('owner_message', () => ({
      kind: 'message',
      sequence: record.sequence,
      messageID: null,
      from: null,
      body: getText(fields, 'text'),
      hop: 0,
      isBrief: false,
    }))
    .with('trigger.task_input', () => {
      const event = sessionEventSchema.safeParse(fields['event']);

      return {
        kind: 'event',
        sequence: record.sequence,
        event: event.success ? event.data : null,
      };
    })
    .otherwise(() => ({ kind: 'other', sequence: record.sequence }));
}

function getText(fields: JSONObject, name: string): string {
  const value = fields[name];

  return typeof value === 'string' ? value : '';
}
